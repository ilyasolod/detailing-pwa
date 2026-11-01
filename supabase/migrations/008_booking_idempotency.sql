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
