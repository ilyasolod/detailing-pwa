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
