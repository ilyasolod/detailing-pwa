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

    -- Clean expired bookings on fetch
    PERFORM cleanup_expired_bookings(v_company.id);

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

    -- Sum service durations
    SELECT COALESCE(SUM(duration_minutes), 0)
    INTO v_total_duration
    FROM services
    WHERE company_id = p_company_id
      AND id = ANY(p_service_ids)
      AND active = true;

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
        COALESCE(SUM(duration_minutes), 0),
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

    -- 8. Generate readable public code (e.g. DL-101)
    v_prefix := upper(regexp_replace(v_company.slug, '[^a-zA-Z0-9]', '', 'g'));
    IF length(v_prefix) > 2 THEN
        v_prefix := substring(v_prefix from 1 for 2);
    ELSE
        v_prefix := 'DL';
    END IF;

    SELECT COUNT(*) + 1 INTO v_seq FROM bookings WHERE company_id = p_company_id;
    v_public_code := v_prefix || '-' || lpad(v_seq::text, 3, '0');

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
BEGIN
    IF NOT is_company_admin(p_company_id) THEN
        RAISE EXCEPTION 'Unauthorized: you are not an administrator of this company';
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = p_company_id;
    SELECT COUNT(*) + 1 INTO v_seq FROM bookings WHERE company_id = p_company_id;
    v_public_code := 'MAN-' || lpad(v_seq::text, 3, '0');
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

    INSERT INTO blocked_intervals (company_id, starts_at, ends_at, reason)
    VALUES (p_company_id, p_starts_at, p_ends_at, p_reason)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id, 'company_id', p_company_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'reason', p_reason);
END;
$$;
