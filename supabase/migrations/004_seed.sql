-- ============================================================================
-- 004_seed.sql — Initial Seed Data for Detailing Centers
-- ============================================================================
-- Inserts demo companies: Detail Lab (Almaty) and Auto Studio (Astana)
-- with active services, portfolio photos, weekly schedules, and break times.
--
-- NOTE ON AUTH USERS:
-- Real owner accounts are created securely via Supabase Dashboard / Auth Admin API.
-- To assign an owner to a studio after creating their Supabase Auth account:
-- INSERT INTO company_admins (company_id, user_id, role)
-- VALUES ('<company-uuid>', '<auth-user-uuid>', 'owner')
-- ON CONFLICT (company_id, user_id) DO NOTHING;
-- ============================================================================

BEGIN;

-- ── 1. COMPANY 1: Detail Lab (Алматы) ────────────────────────────────────────
INSERT INTO companies (
    id, slug, name, description, logo_url, address, whatsapp_number, timezone, design_settings, duration_calculation_mode, active
)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'detail-lab',
    'Detail Lab',
    'Премиальный детейлинг-центр в Алматы. Профессиональный уход, восстановительная полировка, нанокерамика и защита кузова антигравийной плёнкой.',
    'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=200&q=80',
    'г. Алматы, пр. Аль-Фараби, 77/2',
    '77754757243',
    'Asia/Almaty',
    '{
        "theme_preset": "dark_studio",
        "primary_color": "#E5A93C",
        "secondary_color": "#1E2024",
        "accent_color": "#F59E0B",
        "background_color": "#0A0A0C",
        "text_color": "#F4F4F6",
        "font_pair": "Inter",
        "border_radius": "16px",
        "hero_image": "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1600&q=85",
        "image_style": "rounded-xl shadow-2xl"
    }'::jsonb,
    'max',
    true
)
ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    design_settings = EXCLUDED.design_settings,
    duration_calculation_mode = EXCLUDED.duration_calculation_mode;

-- Services for Detail Lab
INSERT INTO services (id, company_id, name, description, price_from, duration_minutes, image_url, active, sort_order)
VALUES
    ('aaaa0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'Детейлинг-мойка', 'Трехфазная безопасная мойка кузова, деконтаминация дисков, чистка проемов, сушка турбосушкой.', 8000, 90, 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80', true, 1),
    ('aaaa0001-0001-0001-0001-000000000002', '11111111-1111-1111-1111-111111111111', 'Химчистка салона', 'Глубокая биочистка торпедо, кожи, текстиля и ковролина с обработкой кондиционером и озонацией.', 35000, 300, 'https://images.unsplash.com/photo-1584345604476-8ec5e12e42dd?auto=format&fit=crop&w=800&q=80', true, 2),
    ('aaaa0001-0001-0001-0001-000000000003', '11111111-1111-1111-1111-111111111111', 'Полировка кузова', 'Восстановительная абразивная и финишная полировка, устранение до 95% царапин и паутинки, возвращение глубокого блеска.', 45000, 240, 'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=800&q=80', true, 3),
    ('aaaa0001-0001-0001-0001-000000000004', '11111111-1111-1111-1111-111111111111', 'Керамическое покрытие', 'Нанесение 2 слоев нанокерамики 9H + гидрофобный слой. Мощный гидрофоб, насыщенный цвет и защита от реагентов на 24 месяца.', 60000, 180, 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=800&q=80', true, 4),
    ('aaaa0001-0001-0001-0001-000000000005', '11111111-1111-1111-1111-111111111111', 'Оклейка зон риска', 'Бронирование полиуретановой плёнкой: капот, бампер, крылья, фары, зеркала и погрузочная зона.', 75000, 240, 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=800&q=80', true, 5)
ON CONFLICT (id) DO NOTHING;

-- Gallery photos for Detail Lab
INSERT INTO gallery_photos (id, company_id, image_url, sort_order)
VALUES
    ('bbbb0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=900&q=80', 1),
    ('bbbb0001-0001-0001-0001-000000000002', '11111111-1111-1111-1111-111111111111', 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=900&q=80', 2),
    ('bbbb0001-0001-0001-0001-000000000003', '11111111-1111-1111-1111-111111111111', 'https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=900&q=80', 3),
    ('bbbb0001-0001-0001-0001-000000000004', '11111111-1111-1111-1111-111111111111', 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=900&q=80', 4)
ON CONFLICT (id) DO NOTHING;

-- Weekly schedule for Detail Lab: Mon-Sat 09:00-19:00, Sun closed
INSERT INTO weekly_schedule (id, company_id, weekday, is_working, opening_time, closing_time)
VALUES
    ('cccc0001-0001-0001-0001-000000000000', '11111111-1111-1111-1111-111111111111', 0, false, '09:00', '19:00'),
    ('cccc0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 1, true,  '09:00', '19:00'),
    ('cccc0001-0001-0001-0001-000000000002', '11111111-1111-1111-1111-111111111111', 2, true,  '09:00', '19:00'),
    ('cccc0001-0001-0001-0001-000000000003', '11111111-1111-1111-1111-111111111111', 3, true,  '09:00', '19:00'),
    ('cccc0001-0001-0001-0001-000000000004', '11111111-1111-1111-1111-111111111111', 4, true,  '09:00', '19:00'),
    ('cccc0001-0001-0001-0001-000000000005', '11111111-1111-1111-1111-111111111111', 5, true,  '09:00', '19:00'),
    ('cccc0001-0001-0001-0001-000000000006', '11111111-1111-1111-1111-111111111111', 6, true,  '09:00', '19:00')
ON CONFLICT (company_id, weekday) DO NOTHING;

-- Schedule breaks for Detail Lab: 13:00-14:00 Mon-Sat
INSERT INTO schedule_breaks (id, company_id, weekday, start_time, end_time)
VALUES
    ('dddd0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 1, '13:00', '14:00'),
    ('dddd0001-0001-0001-0001-000000000002', '11111111-1111-1111-1111-111111111111', 2, '13:00', '14:00'),
    ('dddd0001-0001-0001-0001-000000000003', '11111111-1111-1111-1111-111111111111', 3, '13:00', '14:00'),
    ('dddd0001-0001-0001-0001-000000000004', '11111111-1111-1111-1111-111111111111', 4, '13:00', '14:00'),
    ('dddd0001-0001-0001-0001-000000000005', '11111111-1111-1111-1111-111111111111', 5, '13:00', '14:00'),
    ('dddd0001-0001-0001-0001-000000000006', '11111111-1111-1111-1111-111111111111', 6, '13:00', '14:00')
ON CONFLICT DO NOTHING;

-- ── 2. COMPANY 2: Auto Studio (Астана) ───────────────────────────────────────
INSERT INTO companies (
    id, slug, name, description, logo_url, address, whatsapp_number, timezone, design_settings, duration_calculation_mode, active
)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    'auto-studio',
    'Auto Studio',
    'Студия автостайлинга и бережного детейлинга в Астане. Чистый технологичный подход к уходу за вашим автомобилем.',
    'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=200&q=80',
    'г. Астана, ул. Туран, 48',
    '77754757243',
    'Asia/Almaty',
    '{
        "theme_preset": "clean_automotive",
        "primary_color": "#3B82F6",
        "secondary_color": "#F1F5F9",
        "accent_color": "#06B6D4",
        "background_color": "#0D1117",
        "text_color": "#F8FAFC",
        "font_pair": "Inter",
        "border_radius": "12px",
        "hero_image": "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=85",
        "image_style": "rounded-lg border border-blue-500/20"
    }'::jsonb,
    'max',
    true
)
ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    design_settings = EXCLUDED.design_settings,
    duration_calculation_mode = EXCLUDED.duration_calculation_mode;

INSERT INTO services (id, company_id, name, description, price_from, duration_minutes, image_url, active, sort_order)
VALUES
    ('aaaa0002-0002-0002-0002-000000000001', '22222222-2222-2222-2222-222222222222', 'Комплексный детейлинг', 'Глубокая очистка кузова, чистка дисков с защитным силаном и уход за пластиком.', 15000, 120, 'https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&w=800&q=80', true, 1),
    ('aaaa0002-0002-0002-0002-000000000002', '22222222-2222-2222-2222-222222222222', 'Мягкая полировка + Воск', 'Одношаговая полировка для блеска с нанесением твердого воска карнаубы.', 30000, 180, 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=800&q=80', true, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO weekly_schedule (id, company_id, weekday, is_working, opening_time, closing_time)
VALUES
    ('cccc0002-0002-0002-0002-000000000000', '22222222-2222-2222-2222-222222222222', 0, false, '10:00', '18:00'),
    ('cccc0002-0002-0002-0002-000000000001', '22222222-2222-2222-2222-222222222222', 1, true,  '09:00', '20:00'),
    ('cccc0002-0002-0002-0002-000000000002', '22222222-2222-2222-2222-222222222222', 2, true,  '09:00', '20:00'),
    ('cccc0002-0002-0002-0002-000000000003', '22222222-2222-2222-2222-222222222222', 3, true,  '09:00', '20:00'),
    ('cccc0002-0002-0002-0002-000000000004', '22222222-2222-2222-2222-222222222222', 4, true,  '09:00', '20:00'),
    ('cccc0002-0002-0002-0002-000000000005', '22222222-2222-2222-2222-222222222222', 5, true,  '09:00', '20:00'),
    ('cccc0002-0002-0002-0002-000000000006', '22222222-2222-2222-2222-222222222222', 6, true,  '10:00', '18:00')
ON CONFLICT (company_id, weekday) DO NOTHING;

COMMIT;
