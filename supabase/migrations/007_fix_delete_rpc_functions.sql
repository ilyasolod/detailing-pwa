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
