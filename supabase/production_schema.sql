-- ============================================================================
-- PRODUCTION SCHEMA: DETAILING PWA (CLEAN ZERO-SEED DDL)
-- Generated for Clean Production Deployment to Supabase Cloud
-- Sequence: 001 -> 002 -> 003 -> 005 -> 006 -> 007 -> 008 (EXCLUDING 004_seed.sql)
-- ============================================================================

-- ============================================================================
-- FILE: 001_schema.sql
-- ============================================================================
-- ============================================================================
-- 001_schema.sql — Core database schema for Detailing Multi-Tenant PWA
-- ============================================================================
-- One universal database serving multiple independent detailing studios.
-- Single-car service capacity per studio in MVP 1.0.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. companies
CREATE TABLE IF NOT EXISTS companies (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug              text        UNIQUE NOT NULL,
    name              text        NOT NULL,
    description       text,
    logo_url          text,
    address           text,
    whatsapp_number   text        NOT NULL,
    timezone          text        NOT NULL DEFAULT 'Asia/Almaty',
    design_settings   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    duration_calculation_mode text NOT NULL DEFAULT 'max' CHECK (duration_calculation_mode IN ('max', 'sum')),
    active            boolean     NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(active);

-- 2. company_admins
CREATE TABLE IF NOT EXISTS company_admins (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        text        NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_company_admins_user ON company_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_company_admins_company ON company_admins(company_id);

-- 3. services
CREATE TABLE IF NOT EXISTS services (
    id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name              text          NOT NULL,
    description       text,
    price_from        numeric(12,2) NOT NULL CHECK (price_from >= 0),
    duration_minutes  int           NOT NULL CHECK (duration_minutes > 0),
    image_url         text,
    active            boolean       NOT NULL DEFAULT true,
    sort_order        int           NOT NULL DEFAULT 0,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_company ON services(company_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(company_id, active, sort_order);

-- 4. gallery_photos
CREATE TABLE IF NOT EXISTS gallery_photos (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    image_url   text        NOT NULL,
    sort_order  int         NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gallery_company ON gallery_photos(company_id, sort_order);

-- 5. weekly_schedule
CREATE TABLE IF NOT EXISTS weekly_schedule (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    weekday       int         NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sun, 1=Mon, ..., 6=Sat
    is_working    boolean     NOT NULL DEFAULT true,
    opening_time  time        NOT NULL,
    closing_time  time        NOT NULL,
    UNIQUE (company_id, weekday)
);
CREATE INDEX IF NOT EXISTS idx_weekly_schedule_company ON weekly_schedule(company_id);

-- 6. schedule_breaks
CREATE TABLE IF NOT EXISTS schedule_breaks (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    weekday     int         NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time  time        NOT NULL,
    end_time    time        NOT NULL,
    CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_schedule_breaks_company ON schedule_breaks(company_id, weekday);

-- 7. blocked_intervals
CREATE TABLE IF NOT EXISTS blocked_intervals (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    starts_at   timestamptz NOT NULL,
    ends_at     timestamptz NOT NULL,
    reason      text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_blocked_company_range ON blocked_intervals(company_id, starts_at, ends_at);

-- 8. bookings
CREATE TABLE IF NOT EXISTS bookings (
    id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    public_code             text          NOT NULL,
    client_name             text          NOT NULL,
    client_phone            text          NOT NULL,
    car_make                text          NOT NULL,
    car_model               text          NOT NULL,
    services_snapshot       jsonb         NOT NULL,
    total_price_from        numeric(12,2) NOT NULL,
    total_duration_minutes  int           NOT NULL,
    starts_at               timestamptz   NOT NULL,
    ends_at                 timestamptz   NOT NULL,
    status                  text          NOT NULL DEFAULT 'pending'
                                          CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'expired')),
    expires_at              timestamptz,
    created_at              timestamptz   NOT NULL DEFAULT now(),
    updated_at              timestamptz   NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    CONSTRAINT uq_bookings_company_public_code UNIQUE (company_id, public_code)
);
CREATE INDEX IF NOT EXISTS idx_bookings_company_status ON bookings(company_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_company_range ON bookings(company_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_bookings_expires ON bookings(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_bookings_public_code ON bookings(public_code);

-- Guarantee unique constraint idempotently if table already existed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_bookings_company_public_code'
    ) THEN
        ALTER TABLE bookings ADD CONSTRAINT uq_bookings_company_public_code UNIQUE (company_id, public_code);
    END IF;
END $$;

-- Auto-update updated_at helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_updated ON companies;
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_services_updated ON services;
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bookings_updated ON bookings;
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- FILE: 002_rls.sql
-- ============================================================================
-- ============================================================================
-- 002_rls.sql — Row Level Security policies
-- ============================================================================
-- Strict tenant isolation:
-- 1. No public client directory or PII leakage.
-- 2. Authenticated owners only manage their assigned company via company_admins.
-- 3. Anonymous booking creations use secure RPC only.
-- ============================================================================

BEGIN;

-- Helper: verify if the current authenticated user is an admin of the specified company
CREATE OR REPLACE FUNCTION is_company_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.company_admins
        WHERE company_id = p_company_id
          AND user_id = auth.uid()
    );
$$;

-- Explicit RPC execution grants for is_company_admin
REVOKE EXECUTE ON FUNCTION public.is_company_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_admin(uuid) TO authenticated, service_role;

-- Enable Row Level Security on all tables
ALTER TABLE public.companies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_admins    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_photos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_schedule   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_breaks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_intervals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings          ENABLE ROW LEVEL SECURITY;

-- ── 1. companies ─────────────────────────────────────────────────────────────
-- Public can read active company profiles
DROP POLICY IF EXISTS companies_select_public ON public.companies;
CREATE POLICY companies_select_public ON public.companies
    FOR SELECT TO anon, authenticated
    USING (active = true);

-- Owner can update only their own company
DROP POLICY IF EXISTS companies_update_owner ON public.companies;
CREATE POLICY companies_update_owner ON public.companies
    FOR UPDATE TO authenticated
    USING (public.is_company_admin(id))
    WITH CHECK (public.is_company_admin(id));

-- ── 2. company_admins ────────────────────────────────────────────────────────
-- Authenticated users can only see their own admin association
DROP POLICY IF EXISTS company_admins_select_self ON public.company_admins;
CREATE POLICY company_admins_select_self ON public.company_admins
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- ── 3. services ──────────────────────────────────────────────────────────────
-- Public can view active services
DROP POLICY IF EXISTS services_select_public ON public.services;
CREATE POLICY services_select_public ON public.services
    FOR SELECT TO anon, authenticated
    USING (active = true);

-- Owner has full control over their company's services
DROP POLICY IF EXISTS services_all_owner ON public.services;
CREATE POLICY services_all_owner ON public.services
    FOR ALL TO authenticated
    USING (public.is_company_admin(company_id))
    WITH CHECK (public.is_company_admin(company_id));

-- ── 4. gallery_photos ────────────────────────────────────────────────────────
-- Public can view gallery photos
DROP POLICY IF EXISTS gallery_select_public ON public.gallery_photos;
CREATE POLICY gallery_select_public ON public.gallery_photos
    FOR SELECT TO anon, authenticated
    USING (true);

-- Owner has full control over gallery photos
DROP POLICY IF EXISTS gallery_all_owner ON public.gallery_photos;
CREATE POLICY gallery_all_owner ON public.gallery_photos
    FOR ALL TO authenticated
    USING (public.is_company_admin(company_id))
    WITH CHECK (public.is_company_admin(company_id));

-- ── 5. weekly_schedule & schedule_breaks ─────────────────────────────────────
DROP POLICY IF EXISTS weekly_schedule_select_public ON public.weekly_schedule;
CREATE POLICY weekly_schedule_select_public ON public.weekly_schedule
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS weekly_schedule_all_owner ON public.weekly_schedule;
CREATE POLICY weekly_schedule_all_owner ON public.weekly_schedule
    FOR ALL TO authenticated
    USING (public.is_company_admin(company_id))
    WITH CHECK (public.is_company_admin(company_id));

DROP POLICY IF EXISTS schedule_breaks_select_public ON public.schedule_breaks;
CREATE POLICY schedule_breaks_select_public ON public.schedule_breaks
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS schedule_breaks_all_owner ON public.schedule_breaks;
CREATE POLICY schedule_breaks_all_owner ON public.schedule_breaks
    FOR ALL TO authenticated
    USING (public.is_company_admin(company_id))
    WITH CHECK (public.is_company_admin(company_id));

-- ── 6. blocked_intervals ─────────────────────────────────────────────────────
-- Public has NO direct read access to blocked intervals (slot RPC calculates free time)
-- Owner has full control over their company's blocked intervals
DROP POLICY IF EXISTS blocked_intervals_all_owner ON public.blocked_intervals;
CREATE POLICY blocked_intervals_all_owner ON public.blocked_intervals
    FOR ALL TO authenticated
    USING (public.is_company_admin(company_id))
    WITH CHECK (public.is_company_admin(company_id));

-- ── 7. bookings ──────────────────────────────────────────────────────────────
-- Public has NO direct SELECT or INSERT access on bookings!
-- This guarantees complete client privacy and forces all booking creation through create_booking RPC.
DROP POLICY IF EXISTS bookings_all_owner ON public.bookings;
CREATE POLICY bookings_all_owner ON public.bookings
    FOR ALL TO authenticated
    USING (public.is_company_admin(company_id))
    WITH CHECK (public.is_company_admin(company_id));

COMMIT;

-- ============================================================================
-- FILE: 003_functions.sql
-- ============================================================================
-- ============================================================================
-- 003_functions.sql — Server-side RPC functions for Detailing PWA
-- ============================================================================
-- All functions run as SECURITY DEFINER with SET search_path = public.
-- Core booking operations are executed atomically with advisory locks.
-- ============================================================================

-- ── 1. Expired bookings cleaner ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_expired_bookings(p_company_id uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count int;
BEGIN
    UPDATE bookings
    SET status = 'expired'
    WHERE (p_company_id IS NULL OR company_id = p_company_id)
      AND status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at <= now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ── 2. get_company_by_slug ──────────────────────────────────────────────────
-- Safe public entry point: retrieves company public profile, catalog, and schedule
CREATE OR REPLACE FUNCTION get_company_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company         companies%ROWTYPE;
    v_services        jsonb;
    v_gallery         jsonb;
    v_weekly_schedule jsonb;
    v_breaks          jsonb;
BEGIN
    SELECT * INTO v_company
    FROM companies
    WHERE slug = lower(trim(p_slug)) AND active = true;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Active services
    SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    INTO v_services
    FROM (
        SELECT id, company_id, name, description, price_from, duration_minutes, image_url, active, sort_order
        FROM services
        WHERE company_id = v_company.id AND active = true
        ORDER BY sort_order ASC, name ASC
    ) s;

    -- Gallery photos
    SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
    INTO v_gallery
    FROM (
        SELECT id, company_id, image_url, sort_order
        FROM gallery_photos
        WHERE company_id = v_company.id
        ORDER BY sort_order ASC
    ) g;

    -- Weekly schedule
    SELECT COALESCE(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
    INTO v_weekly_schedule
    FROM (
        SELECT id, company_id, weekday, is_working, opening_time, closing_time
        FROM weekly_schedule
        WHERE company_id = v_company.id
        ORDER BY weekday ASC
    ) w;

    -- Schedule breaks
    SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
    INTO v_breaks
    FROM (
        SELECT id, company_id, weekday, start_time, end_time
        FROM schedule_breaks
        WHERE company_id = v_company.id
        ORDER BY weekday ASC, start_time ASC
    ) b;

    RETURN jsonb_build_object(
        'company', jsonb_build_object(
            'id', v_company.id,
            'slug', v_company.slug,
            'name', v_company.name,
            'description', v_company.description,
            'logo_url', v_company.logo_url,
            'address', v_company.address,
            'whatsapp_number', v_company.whatsapp_number,
            'timezone', v_company.timezone,
            'design_settings', v_company.design_settings,
            'duration_calculation_mode', v_company.duration_calculation_mode,
            'active', v_company.active,
            'created_at', v_company.created_at
        ),
        'services', v_services,
        'gallery_photos', v_gallery,
        'weekly_schedule', v_weekly_schedule,
        'schedule_breaks', v_breaks
    );
END;
$$;

-- ── 3. get_available_slots ──────────────────────────────────────────────────
-- Returns free start intervals for the selected services on a specific date.
-- Total duration must fit completely inside working hours without overlap!
CREATE OR REPLACE FUNCTION get_available_slots(
    p_company_id  uuid,
    p_service_ids uuid[],
    p_date        date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company        companies%ROWTYPE;
    v_total_duration int := 0;
    v_dow            int;
    v_day_sched      weekly_schedule%ROWTYPE;
    v_day_start      timestamptz;
    v_day_end        timestamptz;
    v_slot_start     timestamptz;
    v_slot_end       timestamptz;
    v_slots          jsonb := '[]'::jsonb;
    v_is_blocked     boolean;
BEGIN
    -- Auto-clean expired pending reservations first
    PERFORM cleanup_expired_bookings(p_company_id);

    SELECT * INTO v_company FROM companies WHERE id = p_company_id AND active = true;
    IF NOT FOUND THEN
        RETURN '[]'::jsonb;
    END IF;

    -- Calculate service duration based on duration_calculation_mode ('max' vs 'sum')
    IF v_company.duration_calculation_mode = 'sum' THEN
        SELECT COALESCE(SUM(duration_minutes), 0)
        INTO v_total_duration
        FROM services
        WHERE company_id = p_company_id
          AND id = ANY(p_service_ids)
          AND active = true;
    ELSE
        SELECT COALESCE(MAX(duration_minutes), 0)
        INTO v_total_duration
        FROM services
        WHERE company_id = p_company_id
          AND id = ANY(p_service_ids)
          AND active = true;
    END IF;

    IF v_total_duration <= 0 THEN
        RETURN '[]'::jsonb;
    END IF;

    -- Determine day of week: PostgreSQL EXTRACT(DOW) 0=Sun, 1=Mon, ..., 6=Sat
    v_dow := EXTRACT(DOW FROM p_date);

    SELECT * INTO v_day_sched
    FROM weekly_schedule
    WHERE company_id = p_company_id AND weekday = v_dow;

    IF NOT FOUND OR NOT v_day_sched.is_working THEN
        RETURN '[]'::jsonb;
    END IF;

    -- Convert day bounds into timestamptz using company's timezone
    v_day_start := (p_date::text || ' ' || v_day_sched.opening_time::text)::timestamp AT TIME ZONE v_company.timezone;
    v_day_end   := (p_date::text || ' ' || v_day_sched.closing_time::text)::timestamp AT TIME ZONE v_company.timezone;

    -- Slot stepping: 30 minutes
    v_slot_start := v_day_start;

    WHILE v_slot_start + (v_total_duration * interval '1 minute') <= v_day_end LOOP
        v_slot_end := v_slot_start + (v_total_duration * interval '1 minute');

        -- Skip slots that have already passed in reality (if booking for today)
        IF v_slot_start <= now() THEN
            v_slot_start := v_slot_start + interval '30 minutes';
            CONTINUE;
        END IF;

        v_is_blocked := false;

        -- 1. Check breaks on this weekday
        IF EXISTS (
            SELECT 1 FROM schedule_breaks sb
            WHERE sb.company_id = p_company_id
              AND sb.weekday = v_dow
              AND tstzrange(
                    (p_date::text || ' ' || sb.start_time::text)::timestamp AT TIME ZONE v_company.timezone,
                    (p_date::text || ' ' || sb.end_time::text)::timestamp AT TIME ZONE v_company.timezone
                  ) && tstzrange(v_slot_start, v_slot_end)
        ) THEN
            v_is_blocked := true;
        END IF;

        -- 2. Check blocked_intervals
        IF NOT v_is_blocked AND EXISTS (
            SELECT 1 FROM blocked_intervals bi
            WHERE bi.company_id = p_company_id
              AND tstzrange(bi.starts_at, bi.ends_at) && tstzrange(v_slot_start, v_slot_end)
        ) THEN
            v_is_blocked := true;
        END IF;

        -- 3. Check bookings (confirmed OR active pending)
        IF NOT v_is_blocked AND EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.company_id = p_company_id
              AND b.status IN ('confirmed', 'pending')
              AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.expires_at > now()))
              AND tstzrange(b.starts_at, b.ends_at) && tstzrange(v_slot_start, v_slot_end)
        ) THEN
            v_is_blocked := true;
        END IF;

        -- If free, add to results
        IF NOT v_is_blocked THEN
            v_slots := v_slots || jsonb_build_object(
                'starts_at', v_slot_start,
                'ends_at', v_slot_end,
                'formatted_time', to_char(v_slot_start AT TIME ZONE v_company.timezone, 'HH24:MI')
            );
        END IF;

        v_slot_start := v_slot_start + interval '30 minutes';
    END LOOP;

    RETURN v_slots;
END;
$$;

-- ── 4. create_booking ────────────────────────────────────────────────────────
-- Atomic reservation with PostgreSQL advisory transaction lock
CREATE OR REPLACE FUNCTION create_booking(
    p_company_id   uuid,
    p_service_ids  uuid[],
    p_client_name  text,
    p_client_phone text,
    p_car_make     text,
    p_car_model    text,
    p_starts_at    timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company        companies%ROWTYPE;
    v_total_price    numeric(12,2) := 0;
    v_total_duration int := 0;
    v_snapshot       jsonb := '[]'::jsonb;
    v_ends_at        timestamptz;
    v_dow            int;
    v_day_sched      weekly_schedule%ROWTYPE;
    v_day_start      timestamptz;
    v_day_end        timestamptz;
    v_booking_id     uuid;
    v_public_code    text;
    v_prefix         text;
    v_seq            int;
BEGIN
    -- 1. Acquire transaction advisory lock on company to prevent race conditions
    PERFORM pg_advisory_xact_lock(hashtext(p_company_id::text));

    -- Clean expired bookings first
    PERFORM cleanup_expired_bookings(p_company_id);

    -- 2. Verify company
    SELECT * INTO v_company FROM companies WHERE id = p_company_id AND active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company not found or inactive';
    END IF;

    -- 3. Load & calculate selected services from DB directly
    SELECT
        COALESCE(SUM(price_from), 0),
        CASE
            WHEN v_company.duration_calculation_mode = 'sum' THEN COALESCE(SUM(duration_minutes), 0)
            ELSE COALESCE(MAX(duration_minutes), 0)
        END,
        COALESCE(jsonb_agg(jsonb_build_object(
            'id', id,
            'name', name,
            'price_from', price_from,
            'duration_minutes', duration_minutes
        )), '[]'::jsonb)
    INTO v_total_price, v_total_duration, v_snapshot
    FROM services
    WHERE company_id = p_company_id
      AND id = ANY(p_service_ids)
      AND active = true;

    IF v_total_duration <= 0 OR jsonb_array_length(v_snapshot) = 0 THEN
        RAISE EXCEPTION 'No valid active services selected';
    END IF;

    v_ends_at := p_starts_at + (v_total_duration * interval '1 minute');

    -- 4. Validate schedule & working hours
    v_dow := EXTRACT(DOW FROM (p_starts_at AT TIME ZONE v_company.timezone));
    SELECT * INTO v_day_sched
    FROM weekly_schedule
    WHERE company_id = p_company_id AND weekday = v_dow;

    IF NOT FOUND OR NOT v_day_sched.is_working THEN
        RAISE EXCEPTION 'Selected date is not a working day';
    END IF;

    v_day_start := ((p_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || v_day_sched.opening_time::text)::timestamp AT TIME ZONE v_company.timezone;
    v_day_end   := ((p_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || v_day_sched.closing_time::text)::timestamp AT TIME ZONE v_company.timezone;

    IF p_starts_at < v_day_start OR v_ends_at > v_day_end THEN
        RAISE EXCEPTION 'Requested booking exceeds studio working hours';
    END IF;

    -- 5. Validate breaks
    IF EXISTS (
        SELECT 1 FROM schedule_breaks sb
        WHERE sb.company_id = p_company_id
          AND sb.weekday = v_dow
          AND tstzrange(
                ((p_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || sb.start_time::text)::timestamp AT TIME ZONE v_company.timezone,
                ((p_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || sb.end_time::text)::timestamp AT TIME ZONE v_company.timezone
              ) && tstzrange(p_starts_at, v_ends_at)
    ) THEN
        RAISE EXCEPTION 'Requested time conflicts with studio lunch break';
    END IF;

    -- 6. Validate blocked intervals
    IF EXISTS (
        SELECT 1 FROM blocked_intervals bi
        WHERE bi.company_id = p_company_id
          AND tstzrange(bi.starts_at, bi.ends_at) && tstzrange(p_starts_at, v_ends_at)
    ) THEN
        RAISE EXCEPTION 'Requested time is blocked by studio manager';
    END IF;

    -- 7. Validate conflicts with confirmed or active pending bookings
    IF EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.company_id = p_company_id
          AND b.status IN ('confirmed', 'pending')
          AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.expires_at > now()))
          AND tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at, v_ends_at)
    ) THEN
        RAISE EXCEPTION 'Selected slot is already occupied';
    END IF;

    -- 8. Generate unique, collision-resistant public code (e.g. DL-001)
    v_prefix := upper(regexp_replace(v_company.slug, '[^a-zA-Z0-9]', '', 'g'));
    IF length(v_prefix) > 2 THEN
        v_prefix := substring(v_prefix from 1 for 2);
    ELSIF length(v_prefix) = 0 THEN
        v_prefix := 'DL';
    END IF;

    SELECT COALESCE(
        MAX(
            CASE
                WHEN public_code ~ ('^' || v_prefix || '-[0-9]+$')
                THEN substring(public_code from ('^' || v_prefix || '-([0-9]+)$'))::int
                ELSE 0
            END
        ), 0
    ) + 1
    INTO v_seq
    FROM public.bookings
    WHERE company_id = p_company_id;

    LOOP
        v_public_code := v_prefix || '-' || lpad(v_seq::text, 3, '0');
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.bookings
            WHERE company_id = p_company_id AND public_code = v_public_code
        );
        v_seq := v_seq + 1;
    END LOOP;

    -- 9. Insert pending reservation (expires in 30 minutes)
    INSERT INTO bookings (
        company_id,
        public_code,
        client_name,
        client_phone,
        car_make,
        car_model,
        services_snapshot,
        total_price_from,
        total_duration_minutes,
        starts_at,
        ends_at,
        status,
        expires_at
    )
    VALUES (
        p_company_id,
        v_public_code,
        trim(p_client_name),
        trim(p_client_phone),
        trim(p_car_make),
        trim(p_car_model),
        v_snapshot,
        v_total_price,
        v_total_duration,
        p_starts_at,
        v_ends_at,
        'pending',
        now() + interval '30 minutes'
    )
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
        'id', v_booking_id,
        'public_code', v_public_code,
        'company_id', p_company_id,
        'client_name', p_client_name,
        'client_phone', p_client_phone,
        'car_make', p_car_make,
        'car_model', p_car_model,
        'services_snapshot', v_snapshot,
        'total_price_from', v_total_price,
        'total_duration_minutes', v_total_duration,
        'starts_at', p_starts_at,
        'ends_at', v_ends_at,
        'status', 'pending',
        'expires_at', now() + interval '30 minutes'
    );
END;
$$;

-- ── 5. confirm_booking ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION confirm_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    IF NOT is_company_admin(v_booking.company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    UPDATE bookings
    SET status = 'confirmed',
        expires_at = NULL,
        updated_at = now()
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

    RETURN to_jsonb(v_booking);
END;
$$;

-- ── 6. cancel_booking ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    IF NOT is_company_admin(v_booking.company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    UPDATE bookings
    SET status = 'cancelled',
        updated_at = now()
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

    RETURN to_jsonb(v_booking);
END;
$$;

-- ── 7. reschedule_booking ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reschedule_booking(
    p_booking_id   uuid,
    p_new_starts_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking   bookings%ROWTYPE;
    v_company   companies%ROWTYPE;
    v_new_ends  timestamptz;
BEGIN
    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    IF NOT is_company_admin(v_booking.company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    -- Concurrency guard: serialize on the company lock
    PERFORM pg_advisory_xact_lock(hashtext(v_booking.company_id::text));

    SELECT * INTO v_company FROM companies WHERE id = v_booking.company_id;
    v_new_ends := p_new_starts_at + (v_booking.total_duration_minutes * interval '1 minute');

    -- Validate no conflicting bookings (excluding self)
    IF EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.company_id = v_booking.company_id
          AND b.id != p_booking_id
          AND b.status IN ('confirmed', 'pending')
          AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.expires_at > now()))
          AND tstzrange(b.starts_at, b.ends_at) && tstzrange(p_new_starts_at, v_new_ends)
    ) THEN
        RAISE EXCEPTION 'Selected new time conflicts with an existing booking';
    END IF;

    -- Validate no conflicting blocked intervals
    IF EXISTS (
        SELECT 1 FROM blocked_intervals bi
        WHERE bi.company_id = v_booking.company_id
          AND tstzrange(bi.starts_at, bi.ends_at) && tstzrange(p_new_starts_at, v_new_ends)
    ) THEN
        RAISE EXCEPTION 'Selected new time conflicts with a blocked interval';
    END IF;

    UPDATE bookings
    SET starts_at = p_new_starts_at,
        ends_at = v_new_ends,
        status = 'confirmed',
        expires_at = NULL,
        updated_at = now()
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

    RETURN to_jsonb(v_booking);
END;
$$;

-- ── 8. complete_booking ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION complete_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    IF NOT is_company_admin(v_booking.company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    UPDATE bookings
    SET status = 'completed',
        updated_at = now()
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

    RETURN to_jsonb(v_booking);
END;
$$;

-- ── 9. create_manual_booking ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_manual_booking(
    p_company_id    uuid,
    p_client_name   text,
    p_client_phone  text,
    p_car_make      text,
    p_car_model     text,
    p_service_names text,
    p_total_price   numeric(12,2),
    p_starts_at     timestamptz,
    p_ends_at       timestamptz,
    p_notes         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking_id  uuid;
    v_public_code text;
    v_company     companies%ROWTYPE;
    v_seq         int;
    v_duration    int;
    v_prefix      text := 'MAN';
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    IF p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    -- Concurrency guard: serialize on the company lock
    PERFORM pg_advisory_xact_lock(hashtext(p_company_id::text));

    SELECT * INTO v_company FROM companies WHERE id = p_company_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company not found';
    END IF;

    -- Validate no conflicting bookings
    IF EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.company_id = p_company_id
          AND b.status IN ('confirmed', 'pending')
          AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.expires_at > now()))
          AND tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at, p_ends_at)
    ) THEN
        RAISE EXCEPTION 'Requested manual booking conflicts with an existing booking';
    END IF;

    -- Validate no conflicting blocked intervals
    IF EXISTS (
        SELECT 1 FROM blocked_intervals bi
        WHERE bi.company_id = p_company_id
          AND tstzrange(bi.starts_at, bi.ends_at) && tstzrange(p_starts_at, p_ends_at)
    ) THEN
        RAISE EXCEPTION 'Requested time conflicts with a blocked interval';
    END IF;

    -- Generate unique monotonic public code for manual booking (e.g. MAN-001)
    SELECT COALESCE(
        MAX(
            CASE
                WHEN public_code ~ '^MAN-[0-9]+$'
                THEN substring(public_code from '^MAN-([0-9]+)$')::int
                ELSE 0
            END
        ), 0
    ) + 1
    INTO v_seq
    FROM public.bookings
    WHERE company_id = p_company_id;

    LOOP
        v_public_code := v_prefix || '-' || lpad(v_seq::text, 3, '0');
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.bookings
            WHERE company_id = p_company_id AND public_code = v_public_code
        );
        v_seq := v_seq + 1;
    END LOOP;

    v_duration := EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 60;

    INSERT INTO bookings (
        company_id,
        public_code,
        client_name,
        client_phone,
        car_make,
        car_model,
        services_snapshot,
        total_price_from,
        total_duration_minutes,
        starts_at,
        ends_at,
        status,
        expires_at
    )
    VALUES (
        p_company_id,
        v_public_code,
        trim(p_client_name),
        trim(p_client_phone),
        trim(p_car_make),
        trim(p_car_model),
        jsonb_build_array(jsonb_build_object('name', p_service_names, 'price_from', p_total_price, 'duration_minutes', v_duration)),
        p_total_price,
        v_duration,
        p_starts_at,
        p_ends_at,
        'confirmed',
        NULL
    )
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object('id', v_booking_id, 'public_code', v_public_code, 'status', 'confirmed');
END;
$$;

-- ── 10. create_blocked_interval ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_blocked_interval(
    p_company_id uuid,
    p_starts_at  timestamptz,
    p_ends_at    timestamptz,
    p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    IF p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    -- Concurrency guard: serialize on the company lock
    PERFORM pg_advisory_xact_lock(hashtext(p_company_id::text));

    -- Validate no conflicting bookings
    IF EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.company_id = p_company_id
          AND b.status IN ('confirmed', 'pending')
          AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.expires_at > now()))
          AND tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at, p_ends_at)
    ) THEN
        RAISE EXCEPTION 'Blocked interval conflicts with an active booking';
    END IF;

    INSERT INTO blocked_intervals (company_id, starts_at, ends_at, reason)
    VALUES (p_company_id, p_starts_at, p_ends_at, p_reason)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id, 'company_id', p_company_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'reason', p_reason);
END;
$$;

-- ============================================================================
-- RPC Permissions and Access Control
-- ============================================================================
-- 1. Public booking flow: accessible by anon, authenticated, and service_role
GRANT EXECUTE ON FUNCTION public.get_company_by_slug(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid[], date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid[], text, text, text, text, timestamptz) TO anon, authenticated, service_role;

-- 2. Internal maintenance: revoked from public and anon, callable by authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_bookings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_bookings(uuid) TO authenticated, service_role;

-- 3. Administrative functions: revoked from public and anon, granted only to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.confirm_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_booking(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.complete_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_booking(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_manual_booking(uuid, text, text, text, text, text, numeric, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_booking(uuid, text, text, text, text, text, numeric, timestamptz, timestamptz, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_blocked_interval(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_blocked_interval(uuid, timestamptz, timestamptz, text) TO authenticated, service_role;

-- ============================================================================
-- FILE: 005_tenant_security.sql
-- ============================================================================
-- ============================================================================
-- 005_tenant_security.sql — Strict Tenant Isolation and Anti-Enumeration
-- ============================================================================
-- Closes global public table-level SELECT on multi-tenant core entities:
-- 1. companies: Deny anon table scan; allow authenticated admins only for their own studio.
-- 2. services: Deny anon table scan; rely on get_company_by_slug RPC for public display.
-- 3. gallery_photos: Deny anon table scan; rely on get_company_by_slug RPC.
-- 4. weekly_schedule: Deny anon table scan; rely on get_company_by_slug RPC.
-- 5. schedule_breaks: Deny anon table scan; rely on get_company_by_slug RPC.
-- ============================================================================

BEGIN;

-- ── 1. companies ─────────────────────────────────────────────────────────────
-- Удаляем широкую публичную политику чтения
DROP POLICY IF EXISTS companies_select_public ON public.companies;

-- Разрешаем чтение только аутентифицированным администраторам своей компании
DROP POLICY IF EXISTS companies_select_owner ON public.companies;
CREATE POLICY companies_select_owner ON public.companies
    FOR SELECT TO authenticated
    USING (public.is_company_admin(id));


-- ── 2. services ──────────────────────────────────────────────────────────────
-- Удаляем глобальную политику публичного чтения
DROP POLICY IF EXISTS services_select_public ON public.services;
-- Владельцы сохраняют доступ через существующую политику services_all_owner


-- ── 3. gallery_photos ────────────────────────────────────────────────────────
-- Удаляем глобальную политику публичного чтения
DROP POLICY IF EXISTS gallery_select_public ON public.gallery_photos;
-- Владельцы сохраняют доступ через существующую политику gallery_all_owner


-- ── 4. weekly_schedule ───────────────────────────────────────────────────────
-- Удаляем глобальную политику публичного чтения
DROP POLICY IF EXISTS weekly_schedule_select_public ON public.weekly_schedule;
-- Владельцы сохраняют доступ через существующую политику weekly_schedule_all_owner


-- ── 5. schedule_breaks ───────────────────────────────────────────────────────
-- Удаляем глобальную политику публичного чтения
DROP POLICY IF EXISTS schedule_breaks_select_public ON public.schedule_breaks;
-- Владельцы сохраняют доступ через существующую политику schedule_breaks_all_owner

COMMIT;

-- ============================================================================
-- FILE: 006_admin_operations.sql
-- ============================================================================
-- ============================================================================
-- 006_admin_operations.sql — Administrative RPCs and Server-Side Isolation
-- ============================================================================
-- All administrative write and aggregation operations run through validated RPCs:
-- 1. get_owner_dashboard_data: atomic fetch of company, bookings, services, etc.
-- 2. save_service / delete_service: encapsulated service management with image_url.
-- 3. update_company_settings: atomic studio settings whitelist update.
-- 4. delete_blocked_interval: interval deletion under tenant admin check.
-- 5. add_portfolio_photo / delete_portfolio_photo: gallery photo management.
-- 6. update_company_schedule: atomic weekly schedule and break updates.
-- 7. create_manual_booking / create_blocked_interval / reschedule_booking:
--    hardened validations (working hours, breaks, past bookings, conflicts).
-- ============================================================================

BEGIN;

-- Drop obsolete function overloads if migrating from previous draft
DROP FUNCTION IF EXISTS public.save_service(uuid, uuid, text, text, text, numeric, int, int, boolean);
DROP FUNCTION IF EXISTS public.add_portfolio_photo(uuid, text, text);

-- ── 1. get_owner_dashboard_data ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_owner_dashboard_data(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company           jsonb;
    v_bookings          jsonb;
    v_services          jsonb;
    v_gallery_photos    jsonb;
    v_weekly_schedule   jsonb;
    v_schedule_breaks   jsonb;
    v_blocked_intervals jsonb;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    -- Cleanup expired pending holds for this company before returning data
    PERFORM cleanup_expired_bookings(p_company_id);

    -- 1. Company profile
    SELECT to_jsonb(c) INTO v_company
    FROM companies c
    WHERE c.id = p_company_id;

    IF v_company IS NULL THEN
        RAISE EXCEPTION 'Company not found';
    END IF;

    -- 2. Bookings (all statuses, latest first)
    SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.starts_at DESC), '[]'::jsonb)
    INTO v_bookings
    FROM bookings b
    WHERE b.company_id = p_company_id;

    -- 3. Services (sorted by sort_order)
    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order ASC, s.name ASC), '[]'::jsonb)
    INTO v_services
    FROM services s
    WHERE s.company_id = p_company_id;

    -- 4. Gallery photos
    SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.sort_order ASC), '[]'::jsonb)
    INTO v_gallery_photos
    FROM gallery_photos g
    WHERE g.company_id = p_company_id;

    -- 5. Weekly schedule
    SELECT COALESCE(jsonb_agg(to_jsonb(ws) ORDER BY ws.weekday ASC), '[]'::jsonb)
    INTO v_weekly_schedule
    FROM weekly_schedule ws
    WHERE ws.company_id = p_company_id;

    -- 6. Schedule breaks
    SELECT COALESCE(jsonb_agg(to_jsonb(sb) ORDER BY sb.weekday ASC, sb.start_time ASC), '[]'::jsonb)
    INTO v_schedule_breaks
    FROM schedule_breaks sb
    WHERE sb.company_id = p_company_id;

    -- 7. Blocked intervals
    SELECT COALESCE(jsonb_agg(to_jsonb(bi) ORDER BY bi.starts_at ASC), '[]'::jsonb)
    INTO v_blocked_intervals
    FROM blocked_intervals bi
    WHERE bi.company_id = p_company_id;

    RETURN jsonb_build_object(
        'company', v_company,
        'bookings', v_bookings,
        'services', v_services,
        'gallery_photos', v_gallery_photos,
        'weekly_schedule', v_weekly_schedule,
        'schedule_breaks', v_schedule_breaks,
        'blocked_intervals', v_blocked_intervals
    );
END;
$$;

-- ── 2. save_service ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION save_service(
    p_company_id       uuid,
    p_service_id       uuid,
    p_name             text,
    p_description      text,
    p_price_from       numeric(12,2),
    p_duration_minutes int,
    p_image_url        text DEFAULT NULL,
    p_sort_order       int DEFAULT 0,
    p_active           boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_service services%ROWTYPE;
    v_target_id uuid;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    IF trim(COALESCE(p_name, '')) = '' THEN
        RAISE EXCEPTION 'Service name cannot be empty';
    END IF;

    IF p_duration_minutes <= 0 THEN
        RAISE EXCEPTION 'Service duration must be greater than 0 minutes';
    END IF;

    IF p_price_from < 0 THEN
        RAISE EXCEPTION 'Service price cannot be negative';
    END IF;

    -- Strict tenant isolation check for updates
    IF p_service_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM services
            WHERE id = p_service_id AND company_id != p_company_id
        ) THEN
            RAISE EXCEPTION 'Unauthorized: service does not belong to this company';
        END IF;
    END IF;

    v_target_id := COALESCE(p_service_id, gen_random_uuid());

    INSERT INTO services (
        id,
        company_id,
        name,
        description,
        price_from,
        duration_minutes,
        image_url,
        sort_order,
        active,
        updated_at
    )
    VALUES (
        v_target_id,
        p_company_id,
        trim(p_name),
        trim(p_description),
        p_price_from,
        p_duration_minutes,
        NULLIF(trim(p_image_url), ''),
        COALESCE(p_sort_order, 0),
        COALESCE(p_active, true),
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET name             = trim(EXCLUDED.name),
        description      = trim(EXCLUDED.description),
        price_from       = EXCLUDED.price_from,
        duration_minutes = EXCLUDED.duration_minutes,
        image_url        = EXCLUDED.image_url,
        sort_order       = EXCLUDED.sort_order,
        active           = EXCLUDED.active,
        updated_at       = now()
    WHERE services.company_id = p_company_id
    RETURNING * INTO v_service;

    RETURN to_jsonb(v_service);
END;
$$;

-- ── 3. delete_service ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_service(
    p_company_id uuid,
    p_service_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted boolean;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    DELETE FROM services
    WHERE id = p_service_id AND company_id = p_company_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN
        RAISE EXCEPTION 'Service not found or does not belong to this company';
    END IF;

    RETURN jsonb_build_object('success', true, 'deleted_id', p_service_id);
END;
$$;

-- ── 4. update_company_settings ──────────────────────────────────────────────
-- Updates whitelisted company columns only. Disallows changing id, slug, active, created_at.
CREATE OR REPLACE FUNCTION update_company_settings(
    p_company_id uuid,
    p_settings   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company companies%ROWTYPE;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = p_company_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company not found';
    END IF;

    IF p_settings ? 'name' AND trim(p_settings->>'name') = '' THEN
        RAISE EXCEPTION 'Company name cannot be empty';
    END IF;

    IF p_settings ? 'duration_calculation_mode' AND (p_settings->>'duration_calculation_mode') NOT IN ('max', 'sum') THEN
        RAISE EXCEPTION 'Invalid duration calculation mode: must be max or sum';
    END IF;

    IF p_settings ? 'slot_step_minutes' AND (p_settings->>'slot_step_minutes')::int <= 0 THEN
        RAISE EXCEPTION 'Slot step minutes must be greater than 0';
    END IF;

    UPDATE companies
    SET name                      = COALESCE(NULLIF(trim(p_settings->>'name'), ''), v_company.name),
        description               = CASE WHEN p_settings ? 'description' THEN trim(p_settings->>'description') ELSE v_company.description END,
        logo_url                  = CASE WHEN p_settings ? 'logo_url' THEN NULLIF(trim(p_settings->>'logo_url'), '') ELSE v_company.logo_url END,
        address                   = CASE WHEN p_settings ? 'address' THEN NULLIF(trim(p_settings->>'address'), '') ELSE v_company.address END,
        whatsapp_number           = COALESCE(NULLIF(trim(p_settings->>'whatsapp_number'), ''), NULLIF(trim(p_settings->>'phone'), ''), v_company.whatsapp_number),
        timezone                  = COALESCE(NULLIF(trim(p_settings->>'timezone'), ''), v_company.timezone),
        duration_calculation_mode = COALESCE(p_settings->>'duration_calculation_mode', v_company.duration_calculation_mode),
        design_settings           = CASE
                                      WHEN p_settings ? 'design_settings' THEN p_settings->'design_settings'
                                      WHEN p_settings ? 'slot_step_minutes' THEN
                                          COALESCE(v_company.design_settings, '{}'::jsonb) || jsonb_build_object('slot_step_minutes', (p_settings->>'slot_step_minutes')::int)
                                      ELSE v_company.design_settings
                                    END,
        updated_at                = now()
    WHERE id = p_company_id
    RETURNING * INTO v_company;

    RETURN to_jsonb(v_company);
END;
$$;

-- ── 5. delete_blocked_interval ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_blocked_interval(
    p_company_id   uuid,
    p_interval_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted boolean;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    DELETE FROM blocked_intervals
    WHERE id = p_interval_id AND company_id = p_company_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN
        RAISE EXCEPTION 'Blocked interval not found or does not belong to this company';
    END IF;

    RETURN jsonb_build_object('success', true, 'deleted_id', p_interval_id);
END;
$$;

-- ── 6. add_portfolio_photo / delete_portfolio_photo ─────────────────────────
CREATE OR REPLACE FUNCTION add_portfolio_photo(
    p_company_id uuid,
    p_image_url  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_photo gallery_photos%ROWTYPE;
    v_next_sort int;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    IF trim(COALESCE(p_image_url, '')) = '' THEN
        RAISE EXCEPTION 'Image URL cannot be empty';
    END IF;

    SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next_sort
    FROM gallery_photos
    WHERE company_id = p_company_id;

    INSERT INTO gallery_photos (
        company_id,
        image_url,
        sort_order
    )
    VALUES (
        p_company_id,
        trim(p_image_url),
        v_next_sort
    )
    RETURNING * INTO v_photo;

    RETURN to_jsonb(v_photo);
END;
$$;

CREATE OR REPLACE FUNCTION delete_portfolio_photo(
    p_company_id uuid,
    p_photo_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted boolean;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    DELETE FROM gallery_photos
    WHERE id = p_photo_id AND company_id = p_company_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN
        RAISE EXCEPTION 'Photo not found or does not belong to this company';
    END IF;

    RETURN jsonb_build_object('success', true, 'deleted_id', p_photo_id);
END;
$$;

-- ── 7. update_company_schedule ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_company_schedule(
    p_company_id       uuid,
    p_weekly_schedule  jsonb,
    p_schedule_breaks  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item jsonb;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    -- Concurrency guard
    PERFORM pg_advisory_xact_lock(hashtext(p_company_id::text));

    -- Upsert weekly schedule items matching 001_schema.sql columns
    IF p_weekly_schedule IS NOT NULL AND jsonb_typeof(p_weekly_schedule) = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_weekly_schedule)
        LOOP
            INSERT INTO weekly_schedule (
                company_id,
                weekday,
                is_working,
                opening_time,
                closing_time
            )
            VALUES (
                p_company_id,
                (v_item->>'weekday')::int,
                COALESCE((v_item->>'is_working')::boolean, true),
                COALESCE((v_item->>'opening_time')::time, '09:00'::time),
                COALESCE((v_item->>'closing_time')::time, '19:00'::time)
            )
            ON CONFLICT (company_id, weekday) DO UPDATE
            SET is_working   = EXCLUDED.is_working,
                opening_time = EXCLUDED.opening_time,
                closing_time = EXCLUDED.closing_time;
        END LOOP;
    END IF;

    -- Replace schedule breaks for this company matching 001_schema.sql columns
    IF p_schedule_breaks IS NOT NULL AND jsonb_typeof(p_schedule_breaks) = 'array' THEN
        DELETE FROM schedule_breaks WHERE company_id = p_company_id;

        FOR v_item IN SELECT * FROM jsonb_array_elements(p_schedule_breaks)
        LOOP
            INSERT INTO schedule_breaks (
                company_id,
                weekday,
                start_time,
                end_time
            )
            VALUES (
                p_company_id,
                (v_item->>'weekday')::int,
                (v_item->>'start_time')::time,
                (v_item->>'end_time')::time
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 8. Hardened create_manual_booking ───────────────────────────────────────
CREATE OR REPLACE FUNCTION create_manual_booking(
    p_company_id    uuid,
    p_client_name   text,
    p_client_phone  text,
    p_car_make      text,
    p_car_model     text,
    p_service_names text,
    p_total_price   numeric(12,2),
    p_starts_at     timestamptz,
    p_ends_at       timestamptz,
    p_notes         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking     bookings%ROWTYPE;
    v_public_code text;
    v_company     companies%ROWTYPE;
    v_seq         int;
    v_duration    int;
    v_prefix      text := 'MAN';
    v_weekday     int;
    v_work_day    weekly_schedule%ROWTYPE;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    IF p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    -- Validate booking is not in the past (with a 2-minute buffer for network clock skew)
    IF p_starts_at < (now() - interval '2 minutes') THEN
        RAISE EXCEPTION 'Cannot create a booking in the past';
    END IF;

    -- Concurrency guard: serialize on the company lock
    PERFORM pg_advisory_xact_lock(hashtext(p_company_id::text));

    SELECT * INTO v_company FROM companies WHERE id = p_company_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company not found';
    END IF;

    -- Validate working hours for target date in company's timezone
    v_weekday := EXTRACT(DOW FROM (p_starts_at AT TIME ZONE v_company.timezone));
    SELECT * INTO v_work_day
    FROM weekly_schedule
    WHERE company_id = p_company_id AND weekday = v_weekday;

    IF FOUND THEN
        IF NOT v_work_day.is_working THEN
            RAISE EXCEPTION 'Studio is closed on the selected weekday';
        END IF;

        IF (p_starts_at AT TIME ZONE v_company.timezone)::time < v_work_day.opening_time OR
           (p_ends_at AT TIME ZONE v_company.timezone)::time > v_work_day.closing_time THEN
            RAISE EXCEPTION 'Requested time is outside of studio working hours';
        END IF;
    END IF;

    -- Validate no conflicting breaks
    IF EXISTS (
        SELECT 1 FROM schedule_breaks sb
        WHERE sb.company_id = p_company_id
          AND sb.weekday = v_weekday
          AND tstzrange(
                ((p_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || sb.start_time::text)::timestamp AT TIME ZONE v_company.timezone,
                ((p_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || sb.end_time::text)::timestamp AT TIME ZONE v_company.timezone
              ) && tstzrange(p_starts_at, p_ends_at)
    ) THEN
        RAISE EXCEPTION 'Requested time conflicts with a scheduled break';
    END IF;

    -- Validate no conflicting bookings
    IF EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.company_id = p_company_id
          AND b.status IN ('confirmed', 'pending')
          AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.expires_at > now()))
          AND tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at, p_ends_at)
    ) THEN
        RAISE EXCEPTION 'Requested manual booking conflicts with an existing booking';
    END IF;

    -- Validate no conflicting blocked intervals
    IF EXISTS (
        SELECT 1 FROM blocked_intervals bi
        WHERE bi.company_id = p_company_id
          AND tstzrange(bi.starts_at, bi.ends_at) && tstzrange(p_starts_at, p_ends_at)
    ) THEN
        RAISE EXCEPTION 'Requested time conflicts with a blocked interval';
    END IF;

    -- Generate unique monotonic public code for manual booking (e.g. MAN-001)
    SELECT COALESCE(
        MAX(
            CASE
                WHEN public_code ~ '^MAN-[0-9]+$'
                THEN substring(public_code from '^MAN-([0-9]+)$')::int
                ELSE 0
            END
        ), 0
    ) + 1
    INTO v_seq
    FROM public.bookings
    WHERE company_id = p_company_id;

    LOOP
        v_public_code := v_prefix || '-' || lpad(v_seq::text, 3, '0');
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.bookings
            WHERE company_id = p_company_id AND public_code = v_public_code
        );
        v_seq := v_seq + 1;
    END LOOP;

    v_duration := EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 60;

    INSERT INTO bookings (
        company_id,
        public_code,
        client_name,
        client_phone,
        car_make,
        car_model,
        services_snapshot,
        total_price_from,
        total_duration_minutes,
        starts_at,
        ends_at,
        status,
        expires_at
    )
    VALUES (
        p_company_id,
        v_public_code,
        trim(p_client_name),
        trim(p_client_phone),
        trim(p_car_make),
        trim(p_car_model),
        jsonb_build_array(jsonb_build_object('name', p_service_names, 'price_from', p_total_price, 'duration_minutes', v_duration)),
        p_total_price,
        v_duration,
        p_starts_at,
        p_ends_at,
        'confirmed',
        NULL
    )
    RETURNING * INTO v_booking;

    RETURN to_jsonb(v_booking);
END;
$$;

-- ── 9. Hardened create_blocked_interval ─────────────────────────────────────
CREATE OR REPLACE FUNCTION create_blocked_interval(
    p_company_id uuid,
    p_starts_at  timestamptz,
    p_ends_at    timestamptz,
    p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_block blocked_intervals%ROWTYPE;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    IF p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    -- Concurrency guard: serialize on the company lock
    PERFORM pg_advisory_xact_lock(hashtext(p_company_id::text));

    -- Validate no conflicting bookings
    IF EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.company_id = p_company_id
          AND b.status IN ('confirmed', 'pending')
          AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.expires_at > now()))
          AND tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at, p_ends_at)
    ) THEN
        RAISE EXCEPTION 'Blocked interval conflicts with an active booking';
    END IF;

    -- Validate no conflicting existing blocked intervals
    IF EXISTS (
        SELECT 1 FROM blocked_intervals bi
        WHERE bi.company_id = p_company_id
          AND tstzrange(bi.starts_at, bi.ends_at) && tstzrange(p_starts_at, p_ends_at)
    ) THEN
        RAISE EXCEPTION 'Blocked interval conflicts with an existing blocked interval';
    END IF;

    INSERT INTO blocked_intervals (company_id, starts_at, ends_at, reason)
    VALUES (p_company_id, p_starts_at, p_ends_at, trim(p_reason))
    RETURNING * INTO v_block;

    RETURN to_jsonb(v_block);
END;
$$;

-- ── 10. Hardened reschedule_booking ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION reschedule_booking(
    p_booking_id    uuid,
    p_new_starts_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking    bookings%ROWTYPE;
    v_company    companies%ROWTYPE;
    v_work_day   weekly_schedule%ROWTYPE;
    v_new_ends   timestamptz;
    v_weekday    int;
BEGIN
    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    IF NOT is_company_admin(v_booking.company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    IF p_new_starts_at < (now() - interval '2 minutes') THEN
        RAISE EXCEPTION 'Cannot reschedule a booking to a past time';
    END IF;

    -- Concurrency guard: serialize on the company lock
    PERFORM pg_advisory_xact_lock(hashtext(v_booking.company_id::text));

    SELECT * INTO v_company FROM companies WHERE id = v_booking.company_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company not found';
    END IF;

    v_new_ends := p_new_starts_at + (v_booking.total_duration_minutes * interval '1 minute');

    -- Validate working hours on target day in company's timezone
    v_weekday := EXTRACT(DOW FROM (p_new_starts_at AT TIME ZONE v_company.timezone));
    SELECT * INTO v_work_day
    FROM weekly_schedule
    WHERE company_id = v_booking.company_id AND weekday = v_weekday;

    IF FOUND THEN
        IF NOT v_work_day.is_working THEN
            RAISE EXCEPTION 'Studio is closed on the selected weekday';
        END IF;

        IF (p_new_starts_at AT TIME ZONE v_company.timezone)::time < v_work_day.opening_time OR
           (v_new_ends AT TIME ZONE v_company.timezone)::time > v_work_day.closing_time THEN
            RAISE EXCEPTION 'Rescheduled time is outside of studio working hours';
        END IF;
    END IF;

    -- Validate no conflicting breaks
    IF EXISTS (
        SELECT 1 FROM schedule_breaks sb
        WHERE sb.company_id = v_booking.company_id
          AND sb.weekday = v_weekday
          AND tstzrange(
                ((p_new_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || sb.start_time::text)::timestamp AT TIME ZONE v_company.timezone,
                ((p_new_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || sb.end_time::text)::timestamp AT TIME ZONE v_company.timezone
              ) && tstzrange(p_new_starts_at, v_new_ends)
    ) THEN
        RAISE EXCEPTION 'Rescheduled time conflicts with a scheduled break';
    END IF;

    -- Validate no conflicting bookings (excluding self)
    IF EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.company_id = v_booking.company_id
          AND b.id != p_booking_id
          AND b.status IN ('confirmed', 'pending')
          AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.expires_at > now()))
          AND tstzrange(b.starts_at, b.ends_at) && tstzrange(p_new_starts_at, v_new_ends)
    ) THEN
        RAISE EXCEPTION 'Selected new time conflicts with an existing booking';
    END IF;

    -- Validate no conflicting blocked intervals
    IF EXISTS (
        SELECT 1 FROM blocked_intervals bi
        WHERE bi.company_id = v_booking.company_id
          AND tstzrange(bi.starts_at, bi.ends_at) && tstzrange(p_new_starts_at, v_new_ends)
    ) THEN
        RAISE EXCEPTION 'Selected new time conflicts with a blocked interval';
    END IF;

    UPDATE bookings
    SET starts_at = p_new_starts_at,
        ends_at = v_new_ends,
        status = 'confirmed',
        expires_at = NULL,
        updated_at = now()
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

    RETURN to_jsonb(v_booking);
END;
$$;

-- ============================================================================
-- Permissions and Access Control
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.get_owner_dashboard_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_dashboard_data(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.save_service(uuid, uuid, text, text, numeric, int, text, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_service(uuid, uuid, text, text, numeric, int, text, int, boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.delete_service(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_service(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_company_settings(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_company_settings(uuid, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.delete_blocked_interval(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_blocked_interval(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.add_portfolio_photo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_portfolio_photo(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.delete_portfolio_photo(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_portfolio_photo(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_company_schedule(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_company_schedule(uuid, jsonb, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_manual_booking(uuid, text, text, text, text, text, numeric, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_booking(uuid, text, text, text, text, text, numeric, timestamptz, timestamptz, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_blocked_interval(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_blocked_interval(uuid, timestamptz, timestamptz, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz) TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- FILE: 007_fix_delete_rpc_functions.sql
-- ============================================================================
-- Migration 007: Fix variable type for ROW_COUNT in delete RPC functions
-- In delete_service, delete_blocked_interval, and delete_portfolio_photo,
-- v_deleted was declared as boolean, but GET DIAGNOSTICS ... = ROW_COUNT returns integer.
-- Fix type to integer so that 'IF v_deleted = 0 THEN' comparison executes correctly.

BEGIN;

-- 1. delete_service
CREATE OR REPLACE FUNCTION public.delete_service(
    p_company_id uuid,
    p_service_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted integer;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    DELETE FROM services
    WHERE id = p_service_id AND company_id = p_company_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN
        RAISE EXCEPTION 'Service not found or does not belong to this company';
    END IF;

    RETURN jsonb_build_object('success', true, 'deleted_id', p_service_id);
END;
$$;

-- 2. delete_blocked_interval
CREATE OR REPLACE FUNCTION public.delete_blocked_interval(
    p_company_id   uuid,
    p_interval_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted integer;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    DELETE FROM blocked_intervals
    WHERE id = p_interval_id AND company_id = p_company_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN
        RAISE EXCEPTION 'Blocked interval not found or does not belong to this company';
    END IF;

    RETURN jsonb_build_object('success', true, 'deleted_id', p_interval_id);
END;
$$;

-- 3. delete_portfolio_photo
CREATE OR REPLACE FUNCTION public.delete_portfolio_photo(
    p_company_id uuid,
    p_photo_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted integer;
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    DELETE FROM gallery_photos
    WHERE id = p_photo_id AND company_id = p_company_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN
        RAISE EXCEPTION 'Photo not found or does not belong to this company';
    END IF;

    RETURN jsonb_build_object('success', true, 'deleted_id', p_photo_id);
END;
$$;

-- Permissions and Access Control
REVOKE EXECUTE ON FUNCTION public.delete_service(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_service(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.delete_blocked_interval(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_blocked_interval(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.delete_portfolio_photo(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_portfolio_photo(uuid, uuid) TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- FILE: 008_booking_idempotency.sql
-- ============================================================================
-- ============================================================================
-- 008_booking_idempotency.sql — Resilient Booking Idempotency Architecture
-- ============================================================================
-- Implements robust idempotency protection for public and admin bookings:
-- 1. Adds idempotency_key UUID column to bookings with unique constraint per company.
-- 2. Creates booking_idempotency_records table to preserve original request hashes,
--    exact response payloads, and history even if individual bookings are modified.
-- 3. Updates create_booking RPC to accept p_idempotency_key UUID:
--    - Same key + matching parameters: returns original booking (solves Lost Response).
--    - Same key + altered parameters: raises strict exception.
--    - Different keys on same interval: strictly enforces conflict checks.
--    - Concurrent submissions with same key: serialized via advisory lock.
-- ============================================================================

BEGIN;

-- ── 1. bookings schema update ───────────────────────────────────────────────
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_company_idempotency
    ON public.bookings (company_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ── 2. booking_idempotency_records table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_idempotency_records (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    idempotency_key uuid NOT NULL,
    booking_id      uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
    params_hash     text NOT NULL,
    response_data   jsonb NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_idempotency_company_key UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_company_key
    ON public.booking_idempotency_records(company_id, idempotency_key);

ALTER TABLE public.booking_idempotency_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_idempotency_admin ON public.booking_idempotency_records;
CREATE POLICY booking_idempotency_admin ON public.booking_idempotency_records
    FOR ALL TO authenticated
    USING (public.is_company_admin(company_id))
    WITH CHECK (public.is_company_admin(company_id));

-- ── 3. Drop legacy create_booking function overload ─────────────────────────
DROP FUNCTION IF EXISTS public.create_booking(uuid, uuid[], text, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.create_booking(uuid, uuid[], text, text, text, text, timestamptz, uuid);

-- ── 4. Atomic create_booking RPC with Idempotency Engine ────────────────────
CREATE OR REPLACE FUNCTION public.create_booking(
    p_company_id      uuid,
    p_service_ids     uuid[],
    p_client_name     text,
    p_client_phone    text,
    p_car_make        text,
    p_car_model       text,
    p_starts_at       timestamptz,
    p_idempotency_key uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company          companies%ROWTYPE;
    v_key              uuid;
    v_params_canonical text;
    v_params_hash      text;
    v_idempotency_rec  booking_idempotency_records%ROWTYPE;
    v_existing_booking bookings%ROWTYPE;
    v_total_price      numeric(12,2) := 0;
    v_total_duration   int := 0;
    v_snapshot         jsonb := '[]'::jsonb;
    v_ends_at          timestamptz;
    v_dow              int;
    v_day_sched        weekly_schedule%ROWTYPE;
    v_day_start        timestamptz;
    v_day_end          timestamptz;
    v_booking_id       uuid;
    v_public_code      text;
    v_prefix           text;
    v_seq              int;
    v_result           jsonb;
BEGIN
    -- Ensure key is never null
    v_key := COALESCE(p_idempotency_key, gen_random_uuid());

    -- 1. Acquire transaction advisory lock on company to serialize concurrent operations
    PERFORM pg_advisory_xact_lock(hashtext(p_company_id::text));

    -- Clean expired bookings first
    PERFORM cleanup_expired_bookings(p_company_id);

    -- 2. Verify company existence and active state
    SELECT * INTO v_company FROM companies WHERE id = p_company_id AND active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company not found or inactive';
    END IF;

    -- 3. Calculate canonical request parameters hash for idempotency verification
    v_params_canonical := jsonb_build_object(
        'company_id', p_company_id,
        'starts_at', p_starts_at,
        'service_ids', (SELECT jsonb_agg(s ORDER BY s) FROM unnest(p_service_ids) s),
        'client_phone', regexp_replace(p_client_phone, '[^0-9]', '', 'g'),
        'client_name', trim(lower(p_client_name)),
        'car_make', trim(lower(p_car_make)),
        'car_model', trim(lower(p_car_model))
    )::text;
    v_params_hash := encode(sha256(v_params_canonical::bytea), 'hex');

    -- 4. Check if this exact idempotency key has already been processed for this company
    SELECT * INTO v_idempotency_rec
    FROM booking_idempotency_records
    WHERE company_id = p_company_id AND idempotency_key = v_key;

    IF FOUND THEN
        -- Verify that input parameters match original request
        IF v_idempotency_rec.params_hash <> v_params_hash THEN
            RAISE EXCEPTION 'Idempotency key % has already been used with different booking parameters', v_key;
        END IF;

        -- Check if associated booking still exists in bookings table
        IF v_idempotency_rec.booking_id IS NOT NULL THEN
            SELECT * INTO v_existing_booking
            FROM bookings
            WHERE id = v_idempotency_rec.booking_id;

            IF FOUND THEN
                -- Return the fresh state of the original booking
                RETURN jsonb_build_object(
                    'id', v_existing_booking.id,
                    'public_code', v_existing_booking.public_code,
                    'company_id', v_existing_booking.company_id,
                    'client_name', v_existing_booking.client_name,
                    'client_phone', v_existing_booking.client_phone,
                    'car_make', v_existing_booking.car_make,
                    'car_model', v_existing_booking.car_model,
                    'services_snapshot', v_existing_booking.services_snapshot,
                    'total_price_from', v_existing_booking.total_price_from,
                    'total_duration_minutes', v_existing_booking.total_duration_minutes,
                    'starts_at', v_existing_booking.starts_at,
                    'ends_at', v_existing_booking.ends_at,
                    'status', v_existing_booking.status,
                    'expires_at', v_existing_booking.expires_at,
                    'idempotency_key', v_existing_booking.idempotency_key
                );
            END IF;
        END IF;

        -- If booking row was purged, return preserved response snapshot (prevents duplicate re-creation)
        RETURN v_idempotency_rec.response_data;
    END IF;

    -- 5. Load & calculate selected services from DB directly
    SELECT
        COALESCE(SUM(price_from), 0),
        CASE
            WHEN v_company.duration_calculation_mode = 'sum' THEN COALESCE(SUM(duration_minutes), 0)
            ELSE COALESCE(MAX(duration_minutes), 0)
        END,
        COALESCE(jsonb_agg(jsonb_build_object(
            'id', id,
            'name', name,
            'price_from', price_from,
            'duration_minutes', duration_minutes
        )), '[]'::jsonb)
    INTO v_total_price, v_total_duration, v_snapshot
    FROM services
    WHERE company_id = p_company_id
      AND id = ANY(p_service_ids)
      AND active = true;

    IF v_total_duration <= 0 OR jsonb_array_length(v_snapshot) = 0 THEN
        RAISE EXCEPTION 'No valid active services selected';
    END IF;

    v_ends_at := p_starts_at + (v_total_duration * interval '1 minute');

    -- 6. Validate schedule & working hours
    v_dow := EXTRACT(DOW FROM (p_starts_at AT TIME ZONE v_company.timezone));
    SELECT * INTO v_day_sched
    FROM weekly_schedule
    WHERE company_id = p_company_id AND weekday = v_dow;

    IF NOT FOUND OR NOT v_day_sched.is_working THEN
        RAISE EXCEPTION 'Selected date is not a working day';
    END IF;

    v_day_start := ((p_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || v_day_sched.opening_time::text)::timestamp AT TIME ZONE v_company.timezone;
    v_day_end   := ((p_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || v_day_sched.closing_time::text)::timestamp AT TIME ZONE v_company.timezone;

    IF p_starts_at < v_day_start OR v_ends_at > v_day_end THEN
        RAISE EXCEPTION 'Requested booking exceeds studio working hours';
    END IF;

    -- 7. Validate breaks
    IF EXISTS (
        SELECT 1 FROM schedule_breaks sb
        WHERE sb.company_id = p_company_id
          AND sb.weekday = v_dow
          AND tstzrange(
                ((p_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || sb.start_time::text)::timestamp AT TIME ZONE v_company.timezone,
                ((p_starts_at AT TIME ZONE v_company.timezone)::date::text || ' ' || sb.end_time::text)::timestamp AT TIME ZONE v_company.timezone
              ) && tstzrange(p_starts_at, v_ends_at)
    ) THEN
        RAISE EXCEPTION 'Requested time conflicts with studio lunch break';
    END IF;

    -- 8. Validate blocked intervals
    IF EXISTS (
        SELECT 1 FROM blocked_intervals bi
        WHERE bi.company_id = p_company_id
          AND tstzrange(bi.starts_at, bi.ends_at) && tstzrange(p_starts_at, v_ends_at)
    ) THEN
        RAISE EXCEPTION 'Requested time is blocked by studio manager';
    END IF;

    -- 9. Validate conflicts with confirmed or active pending bookings
    IF EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.company_id = p_company_id
          AND b.status IN ('confirmed', 'pending')
          AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.expires_at > now()))
          AND tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at, v_ends_at)
    ) THEN
        RAISE EXCEPTION 'Selected slot is already occupied';
    END IF;

    -- 10. Generate unique, collision-resistant public code (e.g. DL-001)
    v_prefix := upper(regexp_replace(v_company.slug, '[^a-zA-Z0-9]', '', 'g'));
    IF length(v_prefix) > 2 THEN
        v_prefix := substring(v_prefix from 1 for 2);
    ELSIF length(v_prefix) = 0 THEN
        v_prefix := 'DL';
    END IF;

    SELECT COALESCE(
        MAX(
            CASE
                WHEN public_code ~ ('^' || v_prefix || '-[0-9]+$')
                THEN substring(public_code from ('^' || v_prefix || '-([0-9]+)$'))::int
                ELSE 0
            END
        ), 0
    ) + 1
    INTO v_seq
    FROM public.bookings
    WHERE company_id = p_company_id;

    LOOP
        v_public_code := v_prefix || '-' || lpad(v_seq::text, 3, '0');
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.bookings
            WHERE company_id = p_company_id AND public_code = v_public_code
        );
        v_seq := v_seq + 1;
    END LOOP;

    -- 11. Insert pending reservation (expires in 30 minutes)
    INSERT INTO bookings (
        company_id,
        idempotency_key,
        public_code,
        client_name,
        client_phone,
        car_make,
        car_model,
        services_snapshot,
        total_price_from,
        total_duration_minutes,
        starts_at,
        ends_at,
        status,
        expires_at
    )
    VALUES (
        p_company_id,
        v_key,
        v_public_code,
        trim(p_client_name),
        trim(p_client_phone),
        trim(p_car_make),
        trim(p_car_model),
        v_snapshot,
        v_total_price,
        v_total_duration,
        p_starts_at,
        v_ends_at,
        'pending',
        now() + interval '30 minutes'
    )
    RETURNING id INTO v_booking_id;

    -- 12. Build confirmed return payload
    v_result := jsonb_build_object(
        'id', v_booking_id,
        'public_code', v_public_code,
        'company_id', p_company_id,
        'client_name', trim(p_client_name),
        'client_phone', trim(p_client_phone),
        'car_make', trim(p_car_make),
        'car_model', trim(p_car_model),
        'services_snapshot', v_snapshot,
        'total_price_from', v_total_price,
        'total_duration_minutes', v_total_duration,
        'starts_at', p_starts_at,
        'ends_at', v_ends_at,
        'status', 'pending',
        'expires_at', now() + interval '30 minutes',
        'idempotency_key', v_key
    );

    -- 13. Persist idempotency audit record
    INSERT INTO booking_idempotency_records (
        company_id,
        idempotency_key,
        booking_id,
        params_hash,
        response_data
    ) VALUES (
        p_company_id,
        v_key,
        v_booking_id,
        v_params_hash,
        v_result
    );

    RETURN v_result;
END;
$$;

-- ── 5. Permissions ──────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_booking(uuid, uuid[], text, text, text, text, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid[], text, text, text, text, timestamptz, uuid) TO anon, authenticated, service_role;

COMMIT;

