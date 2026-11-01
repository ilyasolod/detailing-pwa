import type {
  Company,
  Service,
  GalleryPhoto,
  WeeklyScheduleDay,
  ScheduleBreak,
  CompanyPublicData,
} from '../types/database'

export interface DemoCompanyBundle {
  company: Company
  services: Service[]
  gallery_photos: GalleryPhoto[]
  weekly_schedule: WeeklyScheduleDay[]
  schedule_breaks: ScheduleBreak[]
  adminUser: {
    email: string
    login?: string
    password: string
    role: 'owner'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DETAIL LAB (Основная демонстрационная компания из ТЗ — Алматы)
// ─────────────────────────────────────────────────────────────────────────────
export const DETAIL_LAB_ID = '11111111-1111-1111-1111-111111111111'

export const DEMO_COMPANY_DETAIL_LAB: DemoCompanyBundle = {
  company: {
    id: DETAIL_LAB_ID,
    slug: 'detail-lab',
    name: 'Detail Lab',
    description:
      'Премиальный детейлинг-центр в Алматы. Профессиональный уход, восстановительная полировка, нанокерамика и защита кузова антигравийной плёнкой.',
    logo_url: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=200&q=80',
    address: 'г. Алматы, пр. Аль-Фараби, 77/2',
    whatsapp_number: '77754757243',
    timezone: 'Asia/Almaty',
    active: true,
    created_at: new Date('2026-01-01T00:00:00Z').toISOString(),
    duration_calculation_mode: 'max',
    design_settings: {
      theme_preset: 'dark_studio',
      primary_color: '#E5A93C', // Deep amber gold
      secondary_color: '#1E2024',
      accent_color: '#F59E0B',
      background_color: '#0A0A0C',
      text_color: '#F4F4F6',
      font_pair: 'Inter',
      border_radius: '16px',
      hero_image:
        'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1600&q=85',
      image_style: 'rounded-xl shadow-2xl',
    },
  },
  services: [
    {
      id: 'aaaa0001-0001-0001-0001-000000000001',
      company_id: DETAIL_LAB_ID,
      name: 'Детейлинг-мойка',
      description:
        'Трехфазная безопасная мойка кузова, деконтаминация дисков, чистка проемов, сушка турбосушкой.',
      price_from: 8000,
      duration_minutes: 90,
      image_url:
        'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80',
      active: true,
      sort_order: 1,
    },
    {
      id: 'aaaa0001-0001-0001-0001-000000000002',
      company_id: DETAIL_LAB_ID,
      name: 'Химчистка салона',
      description:
        'Глубокая биочистка торпедо, кожи, текстиля и ковролина с обработкой кондиционером и озонацией.',
      price_from: 35000,
      duration_minutes: 300,
      image_url:
        'https://images.unsplash.com/photo-1584345604476-8ec5e12e42dd?auto=format&fit=crop&w=800&q=80',
      active: true,
      sort_order: 2,
    },
    {
      id: 'aaaa0001-0001-0001-0001-000000000003',
      company_id: DETAIL_LAB_ID,
      name: 'Полировка кузова',
      description:
        'Восстановительная абразивная и финишная полировка, устранение до 95% царапин и паутинки, возвращение глубокого блеска.',
      price_from: 45000,
      duration_minutes: 240,
      image_url:
        'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=800&q=80',
      active: true,
      sort_order: 3,
    },
    {
      id: 'aaaa0001-0001-0001-0001-000000000004',
      company_id: DETAIL_LAB_ID,
      name: 'Керамическое покрытие',
      description:
        'Нанесение 2 слоев нанокерамики 9H + гидрофобный слой. Мощный гидрофоб, насыщенный цвет и защита от реагентов на 24 месяца.',
      price_from: 60000,
      duration_minutes: 180,
      image_url:
        'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=800&q=80',
      active: true,
      sort_order: 4,
    },
    {
      id: 'aaaa0001-0001-0001-0001-000000000005',
      company_id: DETAIL_LAB_ID,
      name: 'Оклейка зон риска',
      description:
        'Бронирование полиуретановой плёнкой: капот, бампер, крылья, фары, зеркала и погрузочная зона.',
      price_from: 75000,
      duration_minutes: 240,
      image_url:
        'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=800&q=80',
      active: true,
      sort_order: 5,
    },
  ],
  gallery_photos: [
    {
      id: 'bbbb0001-0001-0001-0001-000000000001',
      company_id: DETAIL_LAB_ID,
      image_url:
        'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=900&q=80',
      sort_order: 1,
    },
    {
      id: 'bbbb0001-0001-0001-0001-000000000002',
      company_id: DETAIL_LAB_ID,
      image_url:
        'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=900&q=80',
      sort_order: 2,
    },
    {
      id: 'bbbb0001-0001-0001-0001-000000000003',
      company_id: DETAIL_LAB_ID,
      image_url:
        'https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=900&q=80',
      sort_order: 3,
    },
    {
      id: 'bbbb0001-0001-0001-0001-000000000004',
      company_id: DETAIL_LAB_ID,
      image_url:
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=900&q=80',
      sort_order: 4,
    },
  ],
  weekly_schedule: [
    {
      id: 'cccc0001-0001-0001-0001-000000000000',
      company_id: DETAIL_LAB_ID,
      weekday: 0, // Sunday
      is_working: false,
      opening_time: '09:00',
      closing_time: '19:00',
    },
    {
      id: 'cccc0001-0001-0001-0001-000000000001',
      company_id: DETAIL_LAB_ID,
      weekday: 1, // Monday
      is_working: true,
      opening_time: '09:00',
      closing_time: '19:00',
    },
    {
      id: 'cccc0001-0001-0001-0001-000000000002',
      company_id: DETAIL_LAB_ID,
      weekday: 2, // Tuesday
      is_working: true,
      opening_time: '09:00',
      closing_time: '19:00',
    },
    {
      id: 'cccc0001-0001-0001-0001-000000000003',
      company_id: DETAIL_LAB_ID,
      weekday: 3, // Wednesday
      is_working: true,
      opening_time: '09:00',
      closing_time: '19:00',
    },
    {
      id: 'cccc0001-0001-0001-0001-000000000004',
      company_id: DETAIL_LAB_ID,
      weekday: 4, // Thursday
      is_working: true,
      opening_time: '09:00',
      closing_time: '19:00',
    },
    {
      id: 'cccc0001-0001-0001-0001-000000000005',
      company_id: DETAIL_LAB_ID,
      weekday: 5, // Friday
      is_working: true,
      opening_time: '09:00',
      closing_time: '19:00',
    },
    {
      id: 'cccc0001-0001-0001-0001-000000000006',
      company_id: DETAIL_LAB_ID,
      weekday: 6, // Saturday
      is_working: true,
      opening_time: '09:00',
      closing_time: '19:00',
    },
  ],
  schedule_breaks: [
    {
      id: 'dddd0001-0001-0001-0001-000000000001',
      company_id: DETAIL_LAB_ID,
      weekday: 1,
      start_time: '13:00',
      end_time: '14:00',
    },
    {
      id: 'dddd0001-0001-0001-0001-000000000002',
      company_id: DETAIL_LAB_ID,
      weekday: 2,
      start_time: '13:00',
      end_time: '14:00',
    },
    {
      id: 'dddd0001-0001-0001-0001-000000000003',
      company_id: DETAIL_LAB_ID,
      weekday: 3,
      start_time: '13:00',
      end_time: '14:00',
    },
    {
      id: 'dddd0001-0001-0001-0001-000000000004',
      company_id: DETAIL_LAB_ID,
      weekday: 4,
      start_time: '13:00',
      end_time: '14:00',
    },
    {
      id: 'dddd0001-0001-0001-0001-000000000005',
      company_id: DETAIL_LAB_ID,
      weekday: 5,
      start_time: '13:00',
      end_time: '14:00',
    },
    {
      id: 'dddd0001-0001-0001-0001-000000000006',
      company_id: DETAIL_LAB_ID,
      weekday: 6,
      start_time: '13:00',
      end_time: '14:00',
    },
  ],
  adminUser: {
    email: 'owner@detail-lab.kz',
    login: 'Админ',
    password: '12345678',
    role: 'owner',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTO STUDIO (Вторая тестовая компания для проверки изоляции и персонализации)
// ─────────────────────────────────────────────────────────────────────────────
export const AUTO_STUDIO_ID = '22222222-2222-2222-2222-222222222222'

export const DEMO_COMPANY_AUTO_STUDIO: DemoCompanyBundle = {
  company: {
    id: AUTO_STUDIO_ID,
    slug: 'auto-studio',
    name: 'Auto Studio',
    description:
      'Студия автостайлинга и бережного детейлинга в Астане. Чистый технологичный подход к уходу за вашим автомобилем.',
    logo_url: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=200&q=80',
    address: 'г. Астана, ул. Туран, 48',
    whatsapp_number: '77754757243',
    timezone: 'Asia/Almaty',
    active: true,
    created_at: new Date('2026-01-05T00:00:00Z').toISOString(),
    duration_calculation_mode: 'max',
    design_settings: {
      theme_preset: 'clean_automotive',
      primary_color: '#3B82F6', // Crisp automotive blue
      secondary_color: '#F1F5F9',
      accent_color: '#06B6D4',
      background_color: '#0D1117',
      text_color: '#F8FAFC',
      font_pair: 'Inter',
      border_radius: '12px',
      hero_image:
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=85',
      image_style: 'rounded-lg border border-blue-500/20',
    },
  },
  services: [
    {
      id: 'aaaa0002-0002-0002-0002-000000000001',
      company_id: AUTO_STUDIO_ID,
      name: 'Комплексный детейлинг',
      description: 'Глубокая очистка кузова, чистка дисков с защитным силаном и уход за пластиком.',
      price_from: 15000,
      duration_minutes: 120,
      image_url:
        'https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&w=800&q=80',
      active: true,
      sort_order: 1,
    },
    {
      id: 'aaaa0002-0002-0002-0002-000000000002',
      company_id: AUTO_STUDIO_ID,
      name: 'Мягкая полировка + Воск',
      description: 'Одношаговая полировка для блеска с нанесением твердого воска карнаубы.',
      price_from: 30000,
      duration_minutes: 180,
      image_url:
        'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=800&q=80',
      active: true,
      sort_order: 2,
    },
    {
      id: 'aaaa0002-0002-0002-0002-000000000003',
      company_id: AUTO_STUDIO_ID,
      name: 'Детейлинг подкапотного пространства',
      description: 'Сухая диэлектрическая мойка паром и консервация проводки антистатиком.',
      price_from: 18000,
      duration_minutes: 120,
      image_url:
        'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=800&q=80',
      active: true,
      sort_order: 3,
    },
  ],
  gallery_photos: [
    {
      id: 'bbbb0002-0002-0002-0002-000000000001',
      company_id: AUTO_STUDIO_ID,
      image_url:
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80',
      sort_order: 1,
    },
    {
      id: 'bbbb0002-0002-0002-0002-000000000002',
      company_id: AUTO_STUDIO_ID,
      image_url:
        'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=900&q=80',
      sort_order: 2,
    },
  ],
  weekly_schedule: [
    {
      id: 'cccc0002-0002-0002-0002-000000000000',
      company_id: AUTO_STUDIO_ID,
      weekday: 0,
      is_working: false,
      opening_time: '10:00',
      closing_time: '18:00',
    },
    {
      id: 'cccc0002-0002-0002-0002-000000000001',
      company_id: AUTO_STUDIO_ID,
      weekday: 1,
      is_working: true,
      opening_time: '09:00',
      closing_time: '20:00',
    },
    {
      id: 'cccc0002-0002-0002-0002-000000000002',
      company_id: AUTO_STUDIO_ID,
      weekday: 2,
      is_working: true,
      opening_time: '09:00',
      closing_time: '20:00',
    },
    {
      id: 'cccc0002-0002-0002-0002-000000000003',
      company_id: AUTO_STUDIO_ID,
      weekday: 3,
      is_working: true,
      opening_time: '09:00',
      closing_time: '20:00',
    },
    {
      id: 'cccc0002-0002-0002-0002-000000000004',
      company_id: AUTO_STUDIO_ID,
      weekday: 4,
      is_working: true,
      opening_time: '09:00',
      closing_time: '20:00',
    },
    {
      id: 'cccc0002-0002-0002-0002-000000000005',
      company_id: AUTO_STUDIO_ID,
      weekday: 5,
      is_working: true,
      opening_time: '09:00',
      closing_time: '20:00',
    },
    {
      id: 'cccc0002-0002-0002-0002-000000000006',
      company_id: AUTO_STUDIO_ID,
      weekday: 6,
      is_working: true,
      opening_time: '10:00',
      closing_time: '18:00',
    },
  ],
  schedule_breaks: [],
  adminUser: {
    email: 'owner@auto-studio.kz',
    login: 'Админ',
    password: '12345678',
    role: 'owner',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PRIME DETAILING (Третья компания с пресетом Performance — Шымкент)
// ─────────────────────────────────────────────────────────────────────────────
export const PRIME_DETAILING_ID = '33333333-3333-3333-3333-333333333333'

export const DEMO_COMPANY_PRIME_DETAILING: DemoCompanyBundle = {
  company: {
    id: PRIME_DETAILING_ID,
    slug: 'prime-detailing',
    name: 'Prime Detailing',
    description:
      'Спортивный и премиальный детейлинг в Шымкенте. Бронепленка SunTek, полировка спорткаров и керамика ультра-класса.',
    logo_url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=200&q=80',
    address: 'г. Шымкент, ул. Байтурсынова, 12',
    whatsapp_number: '77754757243',
    timezone: 'Asia/Almaty',
    active: true,
    created_at: new Date('2026-01-10T00:00:00Z').toISOString(),
    duration_calculation_mode: 'max',
    design_settings: {
      theme_preset: 'performance',
      primary_color: '#EF4444', // Dynamic crimson red
      secondary_color: '#1C1917',
      accent_color: '#F97316',
      background_color: '#0B090A',
      text_color: '#FAFAFA',
      font_pair: 'Inter',
      border_radius: '10px',
      hero_image:
        'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=1600&q=85',
      image_style: 'rounded-md shadow-red-900/20 shadow-xl',
    },
  },
  services: [
    {
      id: 'aaaa0003-0003-0003-0003-000000000001',
      company_id: PRIME_DETAILING_ID,
      name: 'Спортивная мойка Motorsport',
      description: 'Бесконтактная деликатная мойка с консервацией нано-воском Koch Chemie.',
      price_from: 10000,
      duration_minutes: 60,
      image_url:
        'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80',
      active: true,
      sort_order: 1,
    },
    {
      id: 'aaaa0003-0003-0003-0003-000000000002',
      company_id: PRIME_DETAILING_ID,
      name: 'Полная оклейка матовой броней',
      description: 'Премиальный сатиновый полиуретан с эффектом Frozen. Гарантия 7 лет.',
      price_from: 650000,
      duration_minutes: 720,
      image_url:
        'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80',
      active: true,
      sort_order: 2,
    },
  ],
  gallery_photos: [
    {
      id: 'bbbb0003-0003-0003-0003-000000000001',
      company_id: PRIME_DETAILING_ID,
      image_url:
        'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=900&q=80',
      sort_order: 1,
    },
  ],
  weekly_schedule: [
    {
      id: 'cccc0003-0003-0003-0003-000000000000',
      company_id: PRIME_DETAILING_ID,
      weekday: 0,
      is_working: true,
      opening_time: '10:00',
      closing_time: '20:00',
    },
    {
      id: 'cccc0003-0003-0003-0003-000000000001',
      company_id: PRIME_DETAILING_ID,
      weekday: 1,
      is_working: false,
      opening_time: '10:00',
      closing_time: '20:00',
    },
    {
      id: 'cccc0003-0003-0003-0003-000000000002',
      company_id: PRIME_DETAILING_ID,
      weekday: 2,
      is_working: true,
      opening_time: '10:00',
      closing_time: '20:00',
    },
    {
      id: 'cccc0003-0003-0003-0003-000000000003',
      company_id: PRIME_DETAILING_ID,
      weekday: 3,
      is_working: true,
      opening_time: '10:00',
      closing_time: '20:00',
    },
    {
      id: 'cccc0003-0003-0003-0003-000000000004',
      company_id: PRIME_DETAILING_ID,
      weekday: 4,
      is_working: true,
      opening_time: '10:00',
      closing_time: '20:00',
    },
    {
      id: 'cccc0003-0003-0003-0003-000000000005',
      company_id: PRIME_DETAILING_ID,
      weekday: 5,
      is_working: true,
      opening_time: '10:00',
      closing_time: '20:00',
    },
    {
      id: 'cccc0003-0003-0003-0003-000000000006',
      company_id: PRIME_DETAILING_ID,
      weekday: 6,
      is_working: true,
      opening_time: '10:00',
      closing_time: '20:00',
    },
  ],
  schedule_breaks: [],
  adminUser: {
    email: 'owner@prime-detailing.kz',
    login: 'Админ',
    password: '12345678',
    role: 'owner',
  },
}

export const DEMO_COMPANIES: Record<string, DemoCompanyBundle> = {
  'detail-lab': DEMO_COMPANY_DETAIL_LAB,
  'auto-studio': DEMO_COMPANY_AUTO_STUDIO,
  'prime-detailing': DEMO_COMPANY_PRIME_DETAILING,
}

export function getDemoCompanyBySlug(slug: string): CompanyPublicData | null {
  const norm = slug.toLowerCase()
  const found = DEMO_COMPANIES[norm]
  if (!found) return null
  return {
    company: found.company,
    services: found.services.filter((s) => s.active),
    gallery_photos: [...found.gallery_photos].sort((a, b) => a.sort_order - b.sort_order),
    weekly_schedule: found.weekly_schedule,
    schedule_breaks: found.schedule_breaks,
  }
}
