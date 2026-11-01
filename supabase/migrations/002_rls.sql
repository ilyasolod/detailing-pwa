-- ============================================================================
-- 002_rls.sql — Row Level Security policies
-- ============================================================================
-- Strict tenant isolation:
-- 1. No public client directory or PII leakage.
-- 2. Authenticated owners only manage their assigned company via company_admins.
-- 3. Anonymous booking creations use secure RPC only.
-- ============================================================================

-- Helper: verify if the current authenticated user is an admin of the specified company
CREATE OR REPLACE FUNCTION is_company_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM company_admins
        WHERE company_id = p_company_id
          AND user_id = auth.uid()
    );
$$;

-- Enable Row Level Security on all tables
ALTER TABLE companies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_admins    ENABLE ROW LEVEL SECURITY;
ALTER TABLE services          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_photos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_schedule   ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_breaks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_intervals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings          ENABLE ROW LEVEL SECURITY;

-- ── 1. companies ─────────────────────────────────────────────────────────────
-- Public can read active company profiles
CREATE POLICY companies_select_public ON companies
    FOR SELECT TO anon, authenticated
    USING (active = true);

-- Owner can update only their own company
CREATE POLICY companies_update_owner ON companies
    FOR UPDATE TO authenticated
    USING (is_company_admin(id))
    WITH CHECK (is_company_admin(id));

-- ── 2. company_admins ────────────────────────────────────────────────────────
-- Authenticated users can only see their own admin association
CREATE POLICY company_admins_select_self ON company_admins
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- ── 3. services ──────────────────────────────────────────────────────────────
-- Public can view active services
CREATE POLICY services_select_public ON services
    FOR SELECT TO anon, authenticated
    USING (active = true);

-- Owner has full control over their company's services
CREATE POLICY services_all_owner ON services
    FOR ALL TO authenticated
    USING (is_company_admin(company_id))
    WITH CHECK (is_company_admin(company_id));

-- ── 4. gallery_photos ────────────────────────────────────────────────────────
-- Public can view gallery photos
CREATE POLICY gallery_select_public ON gallery_photos
    FOR SELECT TO anon, authenticated
    USING (true);

-- Owner has full control over gallery photos
CREATE POLICY gallery_all_owner ON gallery_photos
    FOR ALL TO authenticated
    USING (is_company_admin(company_id))
    WITH CHECK (is_company_admin(company_id));

-- ── 5. weekly_schedule & schedule_breaks ─────────────────────────────────────
CREATE POLICY weekly_schedule_select_public ON weekly_schedule
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY weekly_schedule_all_owner ON weekly_schedule
    FOR ALL TO authenticated
    USING (is_company_admin(company_id))
    WITH CHECK (is_company_admin(company_id));

CREATE POLICY schedule_breaks_select_public ON schedule_breaks
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY schedule_breaks_all_owner ON schedule_breaks
    FOR ALL TO authenticated
    USING (is_company_admin(company_id))
    WITH CHECK (is_company_admin(company_id));

-- ── 6. blocked_intervals ─────────────────────────────────────────────────────
-- Public has NO direct read access to blocked intervals (slot RPC calculates free time)
-- Owner has full control over their company's blocked intervals
CREATE POLICY blocked_intervals_all_owner ON blocked_intervals
    FOR ALL TO authenticated
    USING (is_company_admin(company_id))
    WITH CHECK (is_company_admin(company_id));

-- ── 7. bookings ──────────────────────────────────────────────────────────────
-- Public has NO direct SELECT or INSERT access on bookings!
-- This guarantees complete client privacy and forces all booking creation through create_booking RPC.
CREATE POLICY bookings_all_owner ON bookings
    FOR ALL TO authenticated
    USING (is_company_admin(company_id))
    WITH CHECK (is_company_admin(company_id));
