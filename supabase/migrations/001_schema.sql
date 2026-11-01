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
    CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_bookings_company_status ON bookings(company_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_company_range ON bookings(company_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_bookings_expires ON bookings(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_bookings_public_code ON bookings(public_code);

-- Auto-update updated_at helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
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
