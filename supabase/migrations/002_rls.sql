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
