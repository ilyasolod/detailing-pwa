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
