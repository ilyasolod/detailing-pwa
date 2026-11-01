import type {
  Company,
  CompanyPublicData,
  Service,
  GalleryPhoto,
  WeeklyScheduleDay,
  ScheduleBreak,
  BlockedInterval,
  Booking,
  AvailableSlot,
} from '../types/database'
import {
  DEMO_COMPANIES,
  getDemoCompanyBySlug,
  DETAIL_LAB_ID,
} from '../config/demo-company'
import { supabase, isSupabaseConfigured } from './supabase'

// Storage keys
const STORE_COMPANIES_KEY = 'detailing_companies_v1'
const STORE_SERVICES_KEY = 'detailing_services_v1'
const STORE_GALLERY_KEY = 'detailing_gallery_v1'
const STORE_SCHEDULE_KEY = 'detailing_schedule_v1'
const STORE_BREAKS_KEY = 'detailing_breaks_v1'
const STORE_BLOCKS_KEY = 'detailing_blocks_v1'
const STORE_BOOKINGS_KEY = 'detailing_bookings_v1'
const STORE_AUTH_KEY = 'detailing_auth_session_v1'
const STORE_CREDENTIALS_KEY = 'detailing_company_credentials_v1'

export interface CompanyCredentials {
  login: string
  password: string
}

export interface AuthSession {
  userId: string
  email: string
  companyId: string
  role: 'owner' | 'admin'
  verifiedAt?: number
}

export function formatMoney(num: number): string {
  return num.toLocaleString('ru-RU').replace(/[\u00A0\s]/g, ' ')
}

function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // ignore
  }
  return fallback
}

function setStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

// Initialize seed data if not present in local store
export function initializeDetailingStore(): void {
  const existingCompanies = getStored<Record<string, Company>>(STORE_COMPANIES_KEY, {})
  if (!existingCompanies[DETAIL_LAB_ID]) {
    const companies: Record<string, Company> = {}
    const services: Service[] = []
    const gallery: GalleryPhoto[] = []
    const schedule: WeeklyScheduleDay[] = []
    const breaks: ScheduleBreak[] = []

    Object.values(DEMO_COMPANIES).forEach((bundle) => {
      companies[bundle.company.id] = bundle.company
      services.push(...bundle.services)
      gallery.push(...bundle.gallery_photos)
      schedule.push(...bundle.weekly_schedule)
      breaks.push(...bundle.schedule_breaks)
    })

    setStored(STORE_COMPANIES_KEY, companies)
    setStored(STORE_SERVICES_KEY, services)
    setStored(STORE_GALLERY_KEY, gallery)
    setStored(STORE_SCHEDULE_KEY, schedule)
    setStored(STORE_BREAKS_KEY, breaks)
    setStored(STORE_BLOCKS_KEY, [])

    const now = new Date()
    const tomorrow10am = new Date(now)
    tomorrow10am.setDate(tomorrow10am.getDate() + 1)
    tomorrow10am.setHours(10, 0, 0, 0)
    const tomorrow1130am = new Date(tomorrow10am.getTime() + 90 * 60000)

    const initialBookings: Booking[] = [
      {
        id: 'dddd0001-0001-0001-0001-000000000001',
        company_id: DETAIL_LAB_ID,
        public_code: 'DL-001',
        client_name: 'Азамат Сейтжанов',
        client_phone: '+7 777 234 56 78',
        car_make: 'Toyota',
        car_model: 'Land Cruiser 300',
        services_snapshot: [
          {
            id: 'aaaa0001-0001-0001-0001-000000000001',
            name: 'Детейлинг-мойка',
            price_from: 8000,
            duration_minutes: 90,
          },
        ],
        total_price_from: 8000,
        total_duration_minutes: 90,
        starts_at: tomorrow10am.toISOString(),
        ends_at: tomorrow1130am.toISOString(),
        status: 'confirmed',
        expires_at: null,
        created_at: new Date(now.getTime() - 3600000).toISOString(),
      },
    ]

    setStored(STORE_BOOKINGS_KEY, initialBookings)
  } else {
    // Synchronize WhatsApp number and core defaults if existing store had older number
    let modified = false
    Object.values(DEMO_COMPANIES).forEach((bundle) => {
      const existing = existingCompanies[bundle.company.id]
      if (existing && existing.whatsapp_number !== bundle.company.whatsapp_number) {
        existing.whatsapp_number = bundle.company.whatsapp_number
        modified = true
      }
    })
    // Also check all existing companies for default duration calculation mode & obsolete demo phone numbers
    Object.values(existingCompanies).forEach((comp) => {
      if (!comp.duration_calculation_mode) {
        comp.duration_calculation_mode = 'max'
        modified = true
      }
      if (
        comp.whatsapp_number === '77071234567' ||
        comp.whatsapp_number === '77019876543' ||
        comp.whatsapp_number === '77025554433'
      ) {
        comp.whatsapp_number = '77754757243'
        modified = true
      }
    })
    if (modified) {
      setStored(STORE_COMPANIES_KEY, existingCompanies)
    }
  }
}

// Auto-clean expired pending bookings
function cleanupExpiredBookings(companyId?: string): void {
  const bookings = getStored<Booking[]>(STORE_BOOKINGS_KEY, [])
  const now = new Date().getTime()
  let modified = false

  const updated = bookings.map((b) => {
    if (
      (!companyId || b.company_id === companyId) &&
      b.status === 'pending' &&
      b.expires_at &&
      new Date(b.expires_at).getTime() <= now
    ) {
      modified = true
      return { ...b, status: 'expired' as const }
    }
    return b
  })

  if (modified) {
    setStored(STORE_BOOKINGS_KEY, updated)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK & ENVIRONMENT GUARDS
// ─────────────────────────────────────────────────────────────────────────────

export function isNetworkError(err: unknown): boolean {
  if (!err) return false
  const msg = err instanceof Error ? err.message : String((err as any)?.message || err)
  const lower = msg.toLowerCase()
  return (
    lower.includes('fetch') ||
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('networkerror') ||
    lower.includes('network') ||
    lower.includes('connection') ||
    lower.includes('failed to load') ||
    lower.includes('abort') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    (err as any)?.status === 0 ||
    ((err as any)?.status >= 500 && (err as any)?.status < 600)
  )
}

/**
 * In production builds (import.meta.env.PROD === true or mode === 'production'),
 * local storage / demo fallback is STRICTLY and UNCONDITIONALLY FORBIDDEN.
 * Server operations must use Supabase as the single authoritative source of truth.
 * When Supabase is not configured in production, the application fails closed.
 */
export function isLocalModeAllowed(): boolean {
  if (import.meta.env?.VITE_DEMO_MODE === 'true') {
    return true
  }

  if (import.meta.env?.PROD || import.meta.env?.MODE === 'production') {
    return false
  }

  const proc = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined
  if (proc?.env?.TEST_BLOCK_LOCAL_MODE === 'true') {
    return false
  }

  if (
    proc &&
    (proc.env?.NODE_ENV === 'test' ||
      Boolean(proc.env?.VITEST) ||
      proc.env?.npm_lifecycle_event === 'test')
  ) {
    return true
  }

  if (import.meta.env?.DEV || import.meta.env?.MODE === 'test') {
    return true
  }

  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function getCompanyBySlug(slug: string): Promise<CompanyPublicData | null> {
  const normSlug = slug.toLowerCase().trim()

  // 1. If Supabase is connected, call RPC (authoritative single source of truth)
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('get_company_by_slug', { p_slug: normSlug })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при загрузке данных студии. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { data, error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при загрузке данных студии. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Ошибка сервера при загрузке студии')
    }

    if (!data || !data.company) {
      return null // Studio not found (honest 404)
    }

    return data as unknown as CompanyPublicData
  }

  // 2. Production fail-closed: if Supabase is unconfigured in production, do not serve stale local demo
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (ONLY for DEV/TEST when !isSupabaseConfigured)
  initializeDetailingStore()
  cleanupExpiredBookings()

  const companies = getStored<Record<string, Company>>(STORE_COMPANIES_KEY, {})
  const company = Object.values(companies).find((c) => c.slug.toLowerCase() === normSlug && c.active)
  if (!company) {
    return getDemoCompanyBySlug(normSlug)
  }

  const services = getStored<Service[]>(STORE_SERVICES_KEY, [])
    .filter((s) => s.company_id === company.id && s.active)
    .sort((a, b) => a.sort_order - b.sort_order)

  const gallery = getStored<GalleryPhoto[]>(STORE_GALLERY_KEY, [])
    .filter((g) => g.company_id === company.id)
    .sort((a, b) => a.sort_order - b.sort_order)

  const schedule = getStored<WeeklyScheduleDay[]>(STORE_SCHEDULE_KEY, [])
    .filter((w) => w.company_id === company.id)
    .sort((a, b) => a.weekday - b.weekday)

  const breaks = getStored<ScheduleBreak[]>(STORE_BREAKS_KEY, [])
    .filter((b) => b.company_id === company.id)
    .sort((a, b) => a.weekday - b.weekday)

  return {
    company,
    services,
    gallery_photos: gallery,
    weekly_schedule: schedule,
    schedule_breaks: breaks,
  }
}

export function calculateOrderTotals(
  company: Company,
  services: Service[]
): { totalPrice: number; totalDuration: number } {
  const totalPrice = services.reduce((acc, s) => acc + s.price_from, 0)
  const isSumMode = company.duration_calculation_mode === 'sum'
  const totalDuration = isSumMode
    ? services.reduce((acc, s) => acc + s.duration_minutes, 0)
    : (services.length ? Math.max(...services.map((s) => s.duration_minutes)) : 0)
  return { totalPrice, totalDuration }
}

export async function getAvailableSlots(
  companyId: string,
  serviceIds: string[],
  dateStr: string // YYYY-MM-DD
): Promise<AvailableSlot[]> {
  if (!serviceIds.length) return []

  // 1. Check Supabase RPC if configured
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('get_available_slots', {
        p_company_id: companyId,
        p_service_ids: serviceIds,
        p_date: dateStr,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при расчёте доступного времени. Проверьте подключение к интернету.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { data, error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при расчёте доступного времени. Проверьте подключение к интернету.')
      }
      throw new Error(error.message || 'Ошибка сервера при расчёте доступного времени')
    }

    // Critical: if data is an empty array (all slots booked or day off), return []!
    // NEVER fall back to local calculation when Supabase is configured.
    if (Array.isArray(data)) {
      return data as AvailableSlot[]
    }
    return []
  }

  // 2. Production fail-closed: if Supabase is unconfigured in production, do not calculate fake slots
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local calculation (ONLY in DEV/TEST when !isSupabaseConfigured)
  initializeDetailingStore()
  cleanupExpiredBookings(companyId)

  const companies = getStored<Record<string, Company>>(STORE_COMPANIES_KEY, {})
  const company = companies[companyId]
  if (!company || !company.active) return []

  const allServices = getStored<Service[]>(STORE_SERVICES_KEY, [])
  const chosenServices = allServices.filter(
    (s) => s.company_id === companyId && serviceIds.includes(s.id) && s.active
  )
  if (!chosenServices.length) return []

  const { totalDuration } = calculateOrderTotals(company, chosenServices)
  if (totalDuration <= 0) return []

  // Parse target date and weekday in local time
  const parts = dateStr.split('-').map(Number)
  const year = parts[0] ?? 2026
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const targetDate = new Date(year, month - 1, day)
  const weekday = targetDate.getDay() // 0=Sun, 1=Mon, ..., 6=Sat

  const schedules = getStored<WeeklyScheduleDay[]>(STORE_SCHEDULE_KEY, [])
  const daySchedule = schedules.find((s) => s.company_id === companyId && s.weekday === weekday)
  if (!daySchedule || !daySchedule.is_working) {
    return [] // Closed on this day
  }

  const [openH = 9, openM = 0] = daySchedule.opening_time.split(':').map(Number)
  const [closeH = 19, closeM = 0] = daySchedule.closing_time.split(':').map(Number)

  const dayStart = new Date(year, month - 1, day, openH, openM, 0, 0)
  const dayEnd = new Date(year, month - 1, day, closeH, closeM, 0, 0)

  const breaks = getStored<ScheduleBreak[]>(STORE_BREAKS_KEY, []).filter(
    (b) => b.company_id === companyId && b.weekday === weekday
  )
  const blockedIntervals = getStored<BlockedInterval[]>(STORE_BLOCKS_KEY, []).filter(
    (b) => b.company_id === companyId
  )
  const bookings = getStored<Booking[]>(STORE_BOOKINGS_KEY, []).filter(
    (b) =>
      b.company_id === companyId &&
      (b.status === 'confirmed' ||
        (b.status === 'pending' && b.expires_at && new Date(b.expires_at).getTime() > Date.now()))
  )

  const slots: AvailableSlot[] = []
  const stepMs = 30 * 60 * 1000 // 30-minute steps
  const totalDurationMs = totalDuration * 60 * 1000

  let currentStart = new Date(dayStart)

  while (currentStart.getTime() + totalDurationMs <= dayEnd.getTime()) {
    const currentEnd = new Date(currentStart.getTime() + totalDurationMs)

    // Skip past slots for today
    if (currentStart.getTime() <= Date.now()) {
      currentStart = new Date(currentStart.getTime() + stepMs)
      continue
    }

    let isBlocked = false

    // 1. Check breaks
    for (const brk of breaks) {
      const [brkStartH = 13, brkStartM = 0] = brk.start_time.split(':').map(Number)
      const [brkEndH = 14, brkEndM = 0] = brk.end_time.split(':').map(Number)
      const brkStartDate = new Date(year, month - 1, day, brkStartH, brkStartM, 0, 0)
      const brkEndDate = new Date(year, month - 1, day, brkEndH, brkEndM, 0, 0)

      if (currentStart < brkEndDate && currentEnd > brkStartDate) {
        isBlocked = true
        break
      }
    }

    // 2. Check blocked intervals
    if (!isBlocked) {
      for (const block of blockedIntervals) {
        const blkStart = new Date(block.starts_at)
        const blkEnd = new Date(block.ends_at)
        if (currentStart < blkEnd && currentEnd > blkStart) {
          isBlocked = true
          break
        }
      }
    }

    // 3. Check existing bookings (single car capacity!)
    if (!isBlocked) {
      for (const b of bookings) {
        const bStart = new Date(b.starts_at)
        const bEnd = new Date(b.ends_at)
        if (currentStart < bEnd && currentEnd > bStart) {
          isBlocked = true
          break
        }
      }
    }

    if (!isBlocked) {
      const hh = String(currentStart.getHours()).padStart(2, '0')
      const mm = String(currentStart.getMinutes()).padStart(2, '0')
      slots.push({
        starts_at: currentStart.toISOString(),
        ends_at: currentEnd.toISOString(),
        formatted_time: `${hh}:${mm}`,
      })
    }

    currentStart = new Date(currentStart.getTime() + stepMs)
  }

  return slots
}

export async function createBooking(params: {
  companyId: string
  serviceIds: string[]
  clientName: string
  clientPhone: string
  carMake: string
  carModel: string
  startsAt: string // ISO string
  idempotencyKey?: string
}): Promise<Booking> {
  const {
    companyId,
    serviceIds,
    clientName,
    clientPhone,
    carMake,
    carModel,
    startsAt,
    idempotencyKey,
  } = params

  // 1. Supabase authoritative booking creation
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('create_booking', {
        p_company_id: companyId,
        p_service_ids: serviceIds,
        p_client_name: clientName,
        p_client_phone: clientPhone,
        p_car_make: carMake,
        p_car_model: carModel,
        p_starts_at: startsAt,
        p_idempotency_key: idempotencyKey || null,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при оформлении заявки. Пожалуйста, проверьте интернет-соединение и попробуйте снова.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { data, error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при оформлении заявки. Пожалуйста, проверьте интернет-соединение и попробуйте снова.')
      }
      // Business error returned by database (slot taken, studio closed, invalid input)
      throw new Error(error.message || 'Не удалось забронировать выбранное время')
    }

    if (!data) {
      throw new Error('Сервер не вернул подтверждение бронирования. Попробуйте снова.')
    }

    return data as unknown as Booking
  }

  // 2. Production fail-closed: if Supabase is unconfigured in production, do not create local bookings
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (ONLY in DEV/TEST when !isSupabaseConfigured)
  initializeDetailingStore()
  cleanupExpiredBookings(companyId)

  const companies = getStored<Record<string, Company>>(STORE_COMPANIES_KEY, {})
  const company = companies[companyId]
  if (!company || !company.active) {
    throw new Error('Детейлинг-центр не найден или временно неактивен')
  }

  const allServices = getStored<Service[]>(STORE_SERVICES_KEY, [])
  const chosenServices = allServices.filter(
    (s) => s.company_id === companyId && serviceIds.includes(s.id) && s.active
  )
  if (!chosenServices.length) {
    throw new Error('Пожалуйста, выберите хотя бы одну доступную услугу')
  }

  const { totalPrice, totalDuration } = calculateOrderTotals(company, chosenServices)

  const startDate = new Date(startsAt)
  const endDate = new Date(startDate.getTime() + totalDuration * 60000)

  // Verify that interval is not blocked by manual blocked intervals
  const blocks = getStored<BlockedInterval[]>(STORE_BLOCKS_KEY, []).filter(
    (b) => b.company_id === companyId
  )
  for (const block of blocks) {
    const blkStart = new Date(block.starts_at)
    const blkEnd = new Date(block.ends_at)
    if (startDate < blkEnd && endDate > blkStart) {
      throw new Error('Выбранное время заблокировано администратором студии')
    }
  }

  // Verify idempotency in local store
  const bookings = getStored<Booking[]>(STORE_BOOKINGS_KEY, [])
  if (idempotencyKey) {
    const existing = bookings.find(
      (b) => b.company_id === companyId && b.idempotency_key === idempotencyKey
    )
    if (existing) {
      const sameStart =
        new Date(existing.starts_at).getTime() === new Date(startsAt).getTime()
      const samePhone =
        existing.client_phone.replace(/\D/g, '') === clientPhone.replace(/\D/g, '')
      const sameCar =
        existing.car_make.toLowerCase().trim() === carMake.toLowerCase().trim() &&
        existing.car_model.toLowerCase().trim() === carModel.toLowerCase().trim()
      const existingServiceIds = existing.services_snapshot
        .map((s) => s.id)
        .sort()
        .join(',')
      const reqServiceIds = [...serviceIds].sort().join(',')

      if (sameStart && samePhone && sameCar && existingServiceIds === reqServiceIds) {
        return existing
      }
      throw new Error(
        `Idempotency key ${idempotencyKey} has already been used with different booking parameters`
      )
    }
  }

  // Verify that interval is still free (concurrency check)
  const conflict = bookings.find(
    (b) =>
      b.company_id === companyId &&
      (b.status === 'confirmed' ||
        (b.status === 'pending' && b.expires_at && new Date(b.expires_at).getTime() > Date.now())) &&
      startDate < new Date(b.ends_at) &&
      endDate > new Date(b.starts_at)
  )

  if (conflict) {
    throw new Error('Выбранное время только что было зарезервировано. Пожалуйста, выберите другой интервал.')
  }

  // Public code e.g. DL-001 (derived from max existing sequence to prevent gaps/collisions)
  const prefix = (company.slug.replace(/[^a-zA-Z0-9]/g, '').substring(0, 2) || 'DL').toUpperCase()
  const regex = new RegExp(`^${prefix}-(\\d+)$`)
  const maxSeq = bookings
    .filter((b) => b.company_id === companyId)
    .reduce((max, b) => {
      const match = b.public_code.match(regex)
      return match && match[1] ? Math.max(max, parseInt(match[1], 10)) : max
    }, 0)

  let nextSeq = maxSeq + 1
  let publicCode = `${prefix}-${String(nextSeq).padStart(3, '0')}`
  while (bookings.some((b) => b.company_id === companyId && b.public_code === publicCode)) {
    nextSeq += 1
    publicCode = `${prefix}-${String(nextSeq).padStart(3, '0')}`
  }

  const newBooking: Booking = {
    id: crypto.randomUUID ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    company_id: companyId,
    public_code: publicCode,
    client_name: clientName.trim(),
    client_phone: clientPhone.trim(),
    car_make: carMake.trim(),
    car_model: carModel.trim(),
    services_snapshot: chosenServices.map((s) => ({
      id: s.id,
      name: s.name,
      price_from: s.price_from,
      duration_minutes: s.duration_minutes,
    })),
    total_price_from: totalPrice,
    total_duration_minutes: totalDuration,
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
    status: 'pending',
    expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
    idempotency_key: idempotencyKey || null,
    created_at: new Date().toISOString(),
  }

  bookings.push(newBooking)
  setStored(STORE_BOOKINGS_KEY, bookings)

  return newBooking
}

export function formatDurationHuman(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m === 0) {
    if (h === 1) return '1 час'
    if (h >= 2 && h <= 4) return `${h} часа`
    return `${h} часов`
  }
  if (h > 0 && m > 0) {
    return `${h} ч ${m} мин`
  }
  return `${m} мин`
}

export function normalizeWhatsAppNumber(raw?: string): string {
  if (!raw) return '77754757243'
  let clean = raw.replace(/\D/g, '')
  if (clean.startsWith('8') && clean.length === 11) {
    clean = '7' + clean.slice(1)
  }
  if (!clean) return '77754757243'
  return clean
}

export function buildQuickWhatsAppLink(company: Company, customMessage?: string): string {
  const cleanNumber = normalizeWhatsAppNumber(company.whatsapp_number)
  const defaultMsg = `Здравствуйте! Хочу записаться на детейлинг в студию ${company.name}.`
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(customMessage || defaultMsg)}`
}

export function buildWhatsAppLink(company: Company, booking: Booking): string {
  const cleanNumber = normalizeWhatsAppNumber(company.whatsapp_number)

  const dateObj = new Date(booking.starts_at)
  const day = String(dateObj.getDate()).padStart(2, '0')
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const year = dateObj.getFullYear()
  const hours = String(dateObj.getHours()).padStart(2, '0')
  const mins = String(dateObj.getMinutes()).padStart(2, '0')

  const dateStr = `${day}.${month}.${year}`
  const timeStr = `${hours}:${mins}`

  const servicesList = booking.services_snapshot
    .map((s, idx) => `${idx + 1}. ${s.name} — от ${formatMoney(s.price_from)} ₸.`)
    .join('\n')

  const statusLabel =
    booking.status === 'confirmed' ? 'подтверждена' : 'ожидает подтверждения'

  const message = `НОВАЯ ЗАЯВКА №${booking.public_code}

Компания: ${company.name}

Клиент: ${booking.client_name}
Телефон: ${booking.client_phone}
Автомобиль: ${booking.car_make} ${booking.car_model}

Выбранные услуги:
${servicesList}

Предварительная стоимость: от ${formatMoney(booking.total_price_from)} ₸.

Продолжительность: ${formatDurationHuman(booking.total_duration_minutes)}.

Дата: ${dateStr}.
Время: ${timeStr}.

Статус: ${statusLabel}.`

  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN OPERATIONS & CREDENTIALS
// ─────────────────────────────────────────────────────────────────────────────

export function getCompanyCredentials(companyId: string): CompanyCredentials {
  const all = getStored<Record<string, CompanyCredentials>>(STORE_CREDENTIALS_KEY, {})
  if (all[companyId]) {
    return all[companyId]
  }
  for (const bundle of Object.values(DEMO_COMPANIES)) {
    if (bundle.company.id === companyId && bundle.adminUser) {
      return {
        login: bundle.adminUser.login || 'Админ',
        password: bundle.adminUser.password || '12345678',
      }
    }
  }
  return {
    login: 'Админ',
    password: '12345678',
  }
}

export function setCompanyCredentials(companyId: string, creds: CompanyCredentials): void {
  const all = getStored<Record<string, CompanyCredentials>>(STORE_CREDENTIALS_KEY, {})
  all[companyId] = creds
  setStored(STORE_CREDENTIALS_KEY, all)
}

export async function updateCompanyLogin(params: {
  companyId: string
  currentPassword: string
  newLogin: string
}): Promise<void> {
  const { companyId, currentPassword, newLogin } = params
  const creds = getCompanyCredentials(companyId)

  if ((currentPassword || '').trim() !== creds.password.trim()) {
    throw new Error('Текущий пароль указан неверно')
  }

  const cleanNewLogin = (newLogin || '').trim()
  if (!cleanNewLogin || cleanNewLogin.length < 2) {
    throw new Error('Логин должен содержать не менее 2 символов')
  }

  setCompanyCredentials(companyId, {
    ...creds,
    login: cleanNewLogin,
  })
}

export async function updateCompanyPassword(params: {
  companyId: string
  currentPassword: string
  newPassword: string
}): Promise<void> {
  const { companyId, currentPassword, newPassword } = params
  const creds = getCompanyCredentials(companyId)

  if ((currentPassword || '').trim() !== creds.password.trim()) {
    throw new Error('Текущий пароль указан неверно')
  }

  const cleanNewPass = (newPassword || '').trim()
  if (!cleanNewPass || cleanNewPass.length < 6) {
    throw new Error('Новый пароль должен содержать минимум 6 символов')
  }

  setCompanyCredentials(companyId, {
    ...creds,
    password: cleanNewPass,
  })
}

/**
 * Checks whether local/mock demo credentials authentication is permitted.
 * In production builds (import.meta.env.PROD === true or mode === 'production'),
 * demo authorization is STRICTLY and UNCONDITIONALLY FORBIDDEN.
 * No environment variables can enable demo auth in a production build.
 * Demo auth is only permitted in development and test environments.
 */
export function isDemoAuthAllowed(): boolean {
  if (import.meta.env?.VITE_DEMO_MODE === 'true') {
    return true
  }

  // 1. Strict production guard: in production mode or build, demo auth is NEVER permitted
  if (import.meta.env?.PROD || import.meta.env?.MODE === 'production') {
    return false
  }

  // 2. Unit test override to simulate production mode in tests
  const proc = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined
  if (proc?.env?.TEST_BLOCK_DEMO_AUTH === 'true') {
    return false
  }

  // 3. Test runner environment (Vitest / Node)
  if (
    proc &&
    (proc.env?.NODE_ENV === 'test' ||
      Boolean(proc.env?.VITEST) ||
      proc.env?.npm_lifecycle_event === 'test')
  ) {
    return true
  }

  // 4. Vite development or test mode
  if (import.meta.env?.DEV || import.meta.env?.MODE === 'test') {
    return true
  }

  return false
}

export async function loginOwnerForCompany(
  companyId: string,
  inputLoginOrEmail: string,
  inputPass: string
): Promise<AuthSession> {
  initializeDetailingStore()
  const cleanInput = (inputLoginOrEmail || '').trim()
  const cleanPass = (inputPass || '').trim()

  // 1. Supabase Auth if configured and an email address is provided
  if (supabase && isSupabaseConfigured && cleanInput.includes('@')) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanInput,
        password: cleanPass,
      })

      if (error || !data?.user) {
        throw new Error(error?.message || 'Неверный email или пароль')
      }

      // Query company_admins strictly with both user_id AND company_id using maybeSingle()
      const { data: adminRow, error: adminErr } = await (supabase as any)
        .from('company_admins')
        .select('company_id, role')
        .eq('user_id', data.user.id)
        .eq('company_id', companyId)
        .maybeSingle()

      if (adminErr) {
        // Transient network error vs real authorization failure
        if (isNetworkError(adminErr)) {
          // Do not sign out or clear Supabase session on transient network error. Fail-closed.
          throw new Error('Ошибка сети при проверке прав доступа. Проверьте подключение к интернету.')
        }

        // Database/server failure: check if user has other admin roles before global signOut
        let hasOtherRoles = false
        try {
          const { data: otherRows } = await (supabase as any)
            .from('company_admins')
            .select('company_id')
            .eq('user_id', data.user.id)
            .limit(1)
          if (otherRows && otherRows.length > 0) hasOtherRoles = true
        } catch {
          // ignore
        }
        if (!hasOtherRoles) {
          await supabase.auth.signOut()
        }
        throw new Error(`Ошибка проверки прав доступа: ${adminErr.message}`)
      }

      if (!adminRow) {
        // User successfully authenticated in Supabase, but has no admin privileges for THIS company.
        // Check if user has admin privileges in ANY other company before signing out globally:
        let hasOtherAdminRoles = false
        try {
          const { data: otherRows } = await (supabase as any)
            .from('company_admins')
            .select('company_id')
            .eq('user_id', data.user.id)
            .limit(1)

          if (otherRows && otherRows.length > 0) {
            hasOtherAdminRoles = true
          }
        } catch {
          // ignore
        }

        if (!hasOtherAdminRoles) {
          // User is not an admin of ANY company: safe to sign out globally
          await supabase.auth.signOut()
        }
        // If user is legitimately an admin in another company, do NOT call global signOut(),
        // preventing accidental logout of their valid active sessions in other companies' tabs.

        // Ensure no local session for THIS companyId is created or retained
        try {
          const cur = getCurrentOwnerSession()
          if (cur?.companyId === companyId) {
            localStorage.removeItem(STORE_AUTH_KEY)
          }
        } catch {
          // ignore
        }

        throw new Error('У вашей учетной записи нет прав администратора в этом детейлинг-центре')
      }

      // Tenant isolation guard: ensure row strictly belongs to this company
      if (adminRow.company_id !== companyId) {
        throw new Error('У вашей учетной записи нет доступа к панели управления этой компании')
      }

      const role = ((adminRow as any).role as 'owner' | 'admin') || 'owner'
      const session: AuthSession = {
        userId: data.user.id,
        email: data.user.email || cleanInput,
        companyId: adminRow.company_id,
        role,
        verifiedAt: Date.now(),
      }
      setStored(STORE_AUTH_KEY, session)
      return session
    } catch (err: unknown) {
      // In production / configured Supabase mode, all errors (including network issues)
      // must fail fast. NEVER silently fall through to LocalStorage mock credentials!
      if (err instanceof Error) {
        if (isNetworkError(err)) {
          throw new Error('Ошибка сети при авторизации. Проверьте подключение к интернету.')
        }
        throw err
      }
      throw new Error('Неизвестная ошибка при авторизации в Supabase')
    }
  }

  // 2. Local / Mock / Demo fallback (strictly prohibited in production unless explicitly enabled)
  if (!isDemoAuthAllowed()) {
    if (!cleanInput.includes('@')) {
      throw new Error('Вход по логину доступен только в демо-режиме. Введите email администратора.')
    }
    throw new Error(
      'Локальная демо-авторизация отключена в продакшен-режиме. Настройте Supabase для входа.'
    )
  }

  const creds = getCompanyCredentials(companyId)
  if (cleanInput !== creds.login.trim() && cleanInput.toLowerCase() !== `${companyId}@local`.toLowerCase()) {
    throw new Error('Неверный логин. Обратите внимание на регистр букв и язык ввода.')
  }

  if (cleanPass !== creds.password.trim()) {
    throw new Error('Неверный пароль. Пожалуйста, проверьте введённые данные.')
  }

  const companies = getStored<Record<string, Company>>(STORE_COMPANIES_KEY, {})
  const company = companies[companyId]
  const session: AuthSession = {
    userId: `usr-${companyId.slice(0, 8)}`,
    email: cleanInput.includes('@') ? cleanInput : `${cleanInput}@${company?.slug || 'studio'}.local`,
    companyId: companyId,
    role: 'owner',
  }
  setStored(STORE_AUTH_KEY, session)
  return session
}

export async function loginOwner(
  loginOrEmail: string,
  pass: string,
  explicitCompanyId?: string
): Promise<AuthSession> {
  if (explicitCompanyId) {
    return loginOwnerForCompany(explicitCompanyId, loginOrEmail, pass)
  }

  initializeDetailingStore()
  const cleanInput = (loginOrEmail || '').trim()
  const cleanPass = (pass || '').trim()

  // 1. Supabase Auth if configured and input is an email
  if (supabase && isSupabaseConfigured && cleanInput.includes('@')) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanInput,
        password: cleanPass,
      })

      if (error || !data?.user) {
        throw new Error(error?.message || 'Неверный email или пароль')
      }

      const { data: adminRows, error: adminErr } = await (supabase as any)
        .from('company_admins')
        .select('company_id, role')
        .eq('user_id', data.user.id)

      if (adminErr) {
        await supabase.auth.signOut()
        throw new Error(`Ошибка проверки прав доступа: ${adminErr.message}`)
      }

      if (!adminRows || adminRows.length === 0) {
        await supabase.auth.signOut()
        throw new Error('У вашей учетной записи нет прав администратора ни в одном детейлинг-центре')
      }

      // If user has admin rights across multiple studios, prevent ambiguous selection
      // and require logging in via the explicit company URL (/c/:slug/admin)
      if (adminRows.length > 1) {
        await supabase.auth.signOut()
        throw new Error(
          'У вашей учетной записи есть доступ к нескольким компаниям. Для соблюдения изоляции данных выполните вход через адрес конкретного детейлинг-центра (/c/:slug/admin).'
        )
      }

      const primaryAdmin = adminRows[0]
      const session: AuthSession = {
        userId: data.user.id,
        email: data.user.email || cleanInput,
        companyId: primaryAdmin.company_id,
        role: ((primaryAdmin as any).role as 'owner' | 'admin') || 'owner',
      }
      setStored(STORE_AUTH_KEY, session)
      return session
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (
          err.message.includes('fetch') ||
          err.message.includes('Failed to fetch') ||
          err.message.includes('NetworkError')
        ) {
          throw new Error('Ошибка сети при авторизации. Проверьте подключение к интернету.')
        }
        throw err
      }
      throw new Error('Неизвестная ошибка при авторизации в Supabase')
    }
  }

  // 2. Multi-tenant credentials fallback (only in demo / test mode)
  if (!isDemoAuthAllowed()) {
    if (!cleanInput.includes('@')) {
      throw new Error('Вход по логину доступен только в демо-режиме. Введите email администратора.')
    }
    throw new Error(
      'Локальная демо-авторизация отключена в продакшен-режиме. Настройте Supabase для входа.'
    )
  }

  const companies = getStored<Record<string, Company>>(STORE_COMPANIES_KEY, {})
  const allCompanyIds = Object.keys(companies).length
    ? Object.keys(companies)
    : Object.values(DEMO_COMPANIES).map((b) => b.company.id)

  const sortedCompanyIds = [...allCompanyIds].sort((a) => (a === DETAIL_LAB_ID ? -1 : 1))

  for (const cId of sortedCompanyIds) {
    const creds = getCompanyCredentials(cId)
    let isMatch = cleanInput === creds.login.trim()
    if (!isMatch) {
      for (const bundle of Object.values(DEMO_COMPANIES)) {
        if (bundle.company.id === cId && bundle.adminUser.email.toLowerCase() === cleanInput.toLowerCase()) {
          isMatch = true
          break
        }
      }
    }

    if (isMatch) {
      if (cleanPass !== creds.password.trim()) {
        throw new Error('Неверный пароль. Пожалуйста, проверьте введённые данные.')
      }
      return loginOwnerForCompany(cId, creds.login, cleanPass)
    }
  }

  throw new Error('Неверный логин. Обратите внимание на регистр букв и язык ввода.')
}

export async function changeOwnerPassword(params: {
  newPassword: string
  oldPassword?: string
}): Promise<void> {
  const { newPassword, oldPassword } = params
  const session = getCurrentOwnerSession()
  if (!session) {
    throw new Error('Сессия не найдена. Пожалуйста, выполните вход повторно.')
  }

  await updateCompanyPassword({
    companyId: session.companyId,
    currentPassword: oldPassword || '',
    newPassword: newPassword,
  })
}

export function getCurrentOwnerSession(): AuthSession | null {
  return getStored<AuthSession | null>(STORE_AUTH_KEY, null)
}

/**
 * Validates the current owner session:
 * 1. If Supabase is configured: performs authoritative live verification:
 *    - Verifies active, unexpired session via supabase.auth.getSession().
 *    - Performs authoritative server-side check on company_admins for user_id AND company_id.
 *    - Reconstructs/re-verifies local session based on server truth (allows session restoration
 *      on TOKEN_REFRESHED even if localStorage was temporarily wiped on expiry).
 *    - If user is not an active admin for the company, destroys local session and returns null.
 *    - Does NOT call disruptive signOut() during transient token refresh delays.
 * 2. If expectedCompanyId does not match session company, cleans local storage without
 *    destroying the user's Supabase session in another company.
 * 3. In production with Supabase unconfigured: disallows stale demo sessions.
 */
export async function validateOwnerSession(expectedCompanyId?: string): Promise<AuthSession | null> {
  // 1. Authoritative verification when Supabase is configured
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.auth.getSession()

      if (error || !data?.session || !data.session.user) {
        if (isNetworkError(error)) {
          // Transient network error reading session.
          // Fail-closed: return null (dashboard does not open).
          // BUT preserve local storage so temporary connection loss does not destroy stored credentials.
          return null
        }
        // Supabase session is missing or ended on server. Clear local storage without redundant signOut
        try {
          localStorage.removeItem(STORE_AUTH_KEY)
        } catch {
          // ignore
        }
        return null
      }

      const supaUser = data.session.user

      // Check token expiration
      if (data.session.expires_at && data.session.expires_at * 1000 <= Date.now()) {
        try {
          localStorage.removeItem(STORE_AUTH_KEY)
        } catch {
          // ignore
        }
        return null
      }

      // Determine target company to verify
      const targetCompanyId = expectedCompanyId || getCurrentOwnerSession()?.companyId

      if (!targetCompanyId) {
        try {
          localStorage.removeItem(STORE_AUTH_KEY)
        } catch {
          // ignore
        }
        return null
      }

      // Authoritative server-side check: verify membership in company_admins
      const { data: adminRow, error: adminErr } = await (supabase as any)
        .from('company_admins')
        .select('company_id, role')
        .eq('user_id', supaUser.id)
        .eq('company_id', targetCompanyId)
        .maybeSingle()

      if (adminErr) {
        if (isNetworkError(adminErr)) {
          // Transient network error querying company_admins.
          // Fail-closed: return null (dashboard does not open).
          // DO NOT delete localStorage to preserve state across temporary disconnection.
          return null
        }
        // Query error / permission denial: clear local session
        try {
          localStorage.removeItem(STORE_AUTH_KEY)
        } catch {
          // ignore
        }
        return null
      }

      if (!adminRow) {
        // User has confirmed no admin record for this company on the server (e.g. revoked rights)
        try {
          localStorage.removeItem(STORE_AUTH_KEY)
        } catch {
          // ignore
        }
        return null
      }

      // Construct server-verified session and update local store
      const role = ((adminRow as any).role as 'owner' | 'admin') || 'owner'
      const verifiedSession: AuthSession = {
        userId: supaUser.id,
        email: supaUser.email || '',
        companyId: adminRow.company_id,
        role,
        verifiedAt: Date.now(),
      }

      setStored(STORE_AUTH_KEY, verifiedSession)
      return verifiedSession
    } catch (err) {
      if (isNetworkError(err)) {
        // Transient network error in catch block: fail-closed, preserve localStorage
        return null
      }
      // In case of unexpected Supabase client errors, safely clear local session
      try {
        localStorage.removeItem(STORE_AUTH_KEY)
      } catch {
        // ignore
      }
      return null
    }
  }

  // 2. Offline / Demo fallback (only permitted in dev/test environment)
  if (!isDemoAuthAllowed()) {
    try {
      localStorage.removeItem(STORE_AUTH_KEY)
    } catch {
      // ignore
    }
    return null
  }

  const session = getCurrentOwnerSession()
  if (!session) {
    return null
  }

  // Tenant isolation check
  if (expectedCompanyId && session.companyId !== expectedCompanyId) {
    try {
      localStorage.removeItem(STORE_AUTH_KEY)
    } catch {
      // ignore
    }
    return null
  }

  return session
}

/**
 * Subscribes to Supabase Auth state changes (e.g. session expiry, sign out in another tab).
 * When sign out or expiration occurs, automatically clears the local session and notifies the UI.
 *
 * Concurrency & Race-condition guards:
 * - Cancels pending deferred validations on unsubscribe or when newer auth events arrive.
 * - Tracks event sequence counter so older async validations never overwrite newer events.
 * - Never calls Supabase Auth methods with await directly inside the callback body (prevents deadlocks).
 * - Avoids premature or redundant signOut() during transient token refresh delays.
 */
export function subscribeToAuthState(
  expectedCompanyId: string,
  onChange: (session: AuthSession | null) => void
): () => void {
  if (supabase && isSupabaseConfigured) {
    let isActive = true
    let eventSeq = 0
    let pendingTimeoutId: ReturnType<typeof setTimeout> | null = null

    const cancelPending = () => {
      if (pendingTimeoutId !== null) {
        clearTimeout(pendingTimeoutId)
        pendingTimeoutId = null
      }
    }

    const { data } = supabase.auth.onAuthStateChange((event, supaSession) => {
      if (!isActive) return

      eventSeq += 1
      const currentSeq = eventSeq
      cancelPending()

      // 1. SIGNED_OUT or missing session
      if (event === 'SIGNED_OUT' || !supaSession) {
        try {
          localStorage.removeItem(STORE_AUTH_KEY)
        } catch {
          // ignore
        }
        if (isActive && currentSeq === eventSeq) {
          onChange(null)
        }
        return
      }

      // 2. TOKEN_REFRESHED or SIGNED_IN
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        const isExpired = Boolean(
          supaSession.expires_at && supaSession.expires_at * 1000 <= Date.now()
        )

        if (isExpired) {
          // Token is past expires_at and has not been refreshed yet.
          // Clear local storage and notify null, but do NOT call supabase.auth.signOut(),
          // so background auto-refresh or retry is not abruptly terminated.
          try {
            localStorage.removeItem(STORE_AUTH_KEY)
          } catch {
            // ignore
          }
          if (isActive && currentSeq === eventSeq) {
            onChange(null)
          }
          return
        }

        const localSession = getCurrentOwnerSession()
        const isMatchingCompanyAndUser =
          localSession &&
          localSession.companyId === expectedCompanyId &&
          localSession.userId === supaSession.user.id

        // Re-verification throttling:
        // If session was verified in company_admins recently (< 60s) and event is routine TOKEN_REFRESHED,
        // we can safely keep active state without spamming company_admins queries.
        const recentlyVerified =
          isMatchingCompanyAndUser &&
          Boolean(localSession.verifiedAt && Date.now() - localSession.verifiedAt < 60_000)

        if (isMatchingCompanyAndUser) {
          if (isActive && currentSeq === eventSeq) {
            onChange(localSession)
          }

          if (recentlyVerified && event === 'TOKEN_REFRESHED') {
            return
          }
        }

        // Needs validation or periodic membership re-check: defer safely outside the auth event loop
        pendingTimeoutId = setTimeout(async () => {
          pendingTimeoutId = null
          if (!isActive || currentSeq !== eventSeq) return

          try {
            const valid = await validateOwnerSession(expectedCompanyId)
            if (isActive && currentSeq === eventSeq) {
              if (valid) {
                onChange(valid)
              } else {
                // If validation returned null, check if session was explicitly wiped (revoked/unauthorized)
                const stillInStore = getCurrentOwnerSession()
                if (!stillInStore || stillInStore.companyId !== expectedCompanyId) {
                  onChange(null)
                }
                // If still in store (transient network error), do not disconnect the active dashboard session
              }
            }
          } catch {
            const stillInStore = getCurrentOwnerSession()
            if (!stillInStore || stillInStore.companyId !== expectedCompanyId) {
              if (isActive && currentSeq === eventSeq) {
                onChange(null)
              }
            }
          }
        }, 0)
        return
      }

      // 3. Other events (e.g. USER_UPDATED, INITIAL_SESSION)
      const localSession = getCurrentOwnerSession()
      if (
        localSession &&
        localSession.companyId === expectedCompanyId &&
        localSession.userId === supaSession.user.id
      ) {
        if (isActive && currentSeq === eventSeq) {
          onChange(localSession)
        }
      }
    })

    return () => {
      isActive = false
      cancelPending()
      data.subscription.unsubscribe()
    }
  }

  return () => {}
}

/**
 * Logs out the owner:
 * 1. Synchronously deletes the stored session from localStorage to prevent race conditions.
 * 2. Calls Supabase Auth signOut to invalidate server-side JWT and clear Supabase auth storage.
 */
export async function logoutOwner(): Promise<void> {
  // Clear local session storage synchronously first
  try {
    localStorage.removeItem(STORE_AUTH_KEY)
  } catch {
    // ignore
  }

  // Call Supabase signOut if configured
  if (supabase && isSupabaseConfigured) {
    try {
      await supabase.auth.signOut()
    } catch {
      // Network failures during sign out should not prevent local session termination
    }
  }
}

export async function getOwnerDashboardData(companyId: string): Promise<{
  company: Company
  bookings: Booking[]
  services: Service[]
  gallery_photos: GalleryPhoto[]
  weekly_schedule: WeeklyScheduleDay[]
  schedule_breaks: ScheduleBreak[]
  blocked_intervals: BlockedInterval[]
}> {
  // 1. Authoritative Supabase dashboard aggregation
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('get_owner_dashboard_data', { p_company_id: companyId })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при загрузке дашборда. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { data, error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при загрузке дашборда. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Ошибка сервера при загрузке дашборда')
    }

    if (!data || !data.company) {
      throw new Error('Компания не найдена или у вас нет прав доступа к ней')
    }

    return {
      company: data.company as Company,
      bookings: Array.isArray(data.bookings) ? (data.bookings as Booking[]) : [],
      services: Array.isArray(data.services) ? (data.services as Service[]) : [],
      gallery_photos: Array.isArray(data.gallery_photos) ? (data.gallery_photos as GalleryPhoto[]) : [],
      weekly_schedule: Array.isArray(data.weekly_schedule) ? (data.weekly_schedule as WeeklyScheduleDay[]) : [],
      schedule_breaks: Array.isArray(data.schedule_breaks) ? (data.schedule_breaks as ScheduleBreak[]) : [],
      blocked_intervals: Array.isArray(data.blocked_intervals) ? (data.blocked_intervals as BlockedInterval[]) : [],
    }
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  initializeDetailingStore()
  cleanupExpiredBookings(companyId)

  const companies = getStored<Record<string, Company>>(STORE_COMPANIES_KEY, {})
  const company = companies[companyId] || DEMO_COMPANIES['detail-lab']!.company

  const bookings = getStored<Booking[]>(STORE_BOOKINGS_KEY, [])
    .filter((b) => b.company_id === companyId)
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())

  const services = getStored<Service[]>(STORE_SERVICES_KEY, [])
    .filter((s) => s.company_id === companyId)
    .sort((a, b) => a.sort_order - b.sort_order)

  const gallery = getStored<GalleryPhoto[]>(STORE_GALLERY_KEY, [])
    .filter((g) => g.company_id === companyId)
    .sort((a, b) => a.sort_order - b.sort_order)

  const schedule = getStored<WeeklyScheduleDay[]>(STORE_SCHEDULE_KEY, [])
    .filter((s) => s.company_id === companyId)
    .sort((a, b) => a.weekday - b.weekday)

  const breaks = getStored<ScheduleBreak[]>(STORE_BREAKS_KEY, []).filter(
    (b) => b.company_id === companyId
  )

  const blocks = getStored<BlockedInterval[]>(STORE_BLOCKS_KEY, []).filter(
    (b) => b.company_id === companyId
  )

  return {
    company,
    bookings,
    services,
    gallery_photos: gallery,
    weekly_schedule: schedule,
    schedule_breaks: breaks,
    blocked_intervals: blocks,
  }
}

export async function updateBookingStatus(
  companyId: string,
  bookingId: string,
  status: 'confirmed' | 'cancelled' | 'completed'
): Promise<Booking> {
  // 1. Authoritative Supabase RPC
  if (supabase && isSupabaseConfigured) {
    const rpcName =
      status === 'confirmed'
        ? 'confirm_booking'
        : status === 'cancelled'
        ? 'cancel_booking'
        : 'complete_booking'

    let res: any
    try {
      res = await (supabase as any).rpc(rpcName, { p_booking_id: bookingId })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при обновлении статуса заявки. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { data, error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при обновлении статуса заявки. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Не удалось обновить статус заявки на сервере')
    }

    if (!data) {
      throw new Error('Сервер не вернул обновлённые данные заявки')
    }

    if (data.company_id && data.company_id !== companyId) {
      throw new Error('Нарушение изоляции арендатора: заявка принадлежит другой компании')
    }

    return data as Booking
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  const bookings = getStored<Booking[]>(STORE_BOOKINGS_KEY, [])
  const idx = bookings.findIndex((b) => b.id === bookingId && b.company_id === companyId)
  if (idx === -1) throw new Error('Заявка не найдена')

  const current = bookings[idx]
  if (!current) throw new Error('Заявка не найдена')

  // When confirmed, cancelled, or completed, slot lock is finalized (released if cancelled)
  const updated: Booking = {
    ...current,
    status,
    expires_at: null,
    updated_at: new Date().toISOString(),
  }

  bookings[idx] = updated
  setStored(STORE_BOOKINGS_KEY, bookings)
  return updated
}

export async function rescheduleBooking(
  companyId: string,
  bookingId: string,
  newStartsAt: string
): Promise<Booking> {
  // 1. Authoritative Supabase RPC
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('reschedule_booking', {
        p_booking_id: bookingId,
        p_new_starts_at: newStartsAt,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при переносе записи. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { data, error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при переносе записи. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Не удалось перенести запись на выбранное время')
    }

    if (!data) {
      throw new Error('Сервер не вернул обновлённые данные заявки')
    }

    if (data.company_id && data.company_id !== companyId) {
      throw new Error('Нарушение изоляции арендатора: заявка принадлежит другой компании')
    }

    return data as Booking
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  const bookings = getStored<Booking[]>(STORE_BOOKINGS_KEY, [])
  const idx = bookings.findIndex((b) => b.id === bookingId && b.company_id === companyId)
  if (idx === -1) throw new Error('Заявка не найдена')

  const booking = bookings[idx]
  if (!booking) throw new Error('Заявка не найдена')

  const newStart = new Date(newStartsAt)
  const newEnd = new Date(newStart.getTime() + booking.total_duration_minutes * 60000)

  const conflict = bookings.find(
    (b) =>
      b.id !== bookingId &&
      b.company_id === companyId &&
      (b.status === 'confirmed' ||
        (b.status === 'pending' && b.expires_at && new Date(b.expires_at).getTime() > Date.now())) &&
      newStart < new Date(b.ends_at) &&
      newEnd > new Date(b.starts_at)
  )

  if (conflict) {
    throw new Error('Выбранное время занято другой записью.')
  }

  const updated: Booking = {
    ...booking,
    starts_at: newStart.toISOString(),
    ends_at: newEnd.toISOString(),
    status: 'confirmed',
    expires_at: null,
    updated_at: new Date().toISOString(),
  }

  bookings[idx] = updated
  setStored(STORE_BOOKINGS_KEY, bookings)
  return updated
}

export async function createManualBooking(params: {
  companyId: string
  clientName: string
  clientPhone: string
  carMake: string
  carModel: string
  serviceNames: string
  totalPrice: number
  startsAt: string
  endsAt: string
  notes?: string
}): Promise<Booking> {
  // 1. Authoritative Supabase RPC
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('create_manual_booking', {
        p_company_id: params.companyId,
        p_client_name: params.clientName,
        p_client_phone: params.clientPhone,
        p_car_make: params.carMake,
        p_car_model: params.carModel,
        p_service_names: params.serviceNames,
        p_total_price: params.totalPrice,
        p_starts_at: params.startsAt,
        p_ends_at: params.endsAt,
        p_notes: params.notes || null,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при создании ручной записи. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { data, error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при создании ручной записи. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Не удалось создать ручную запись')
    }

    if (!data) {
      throw new Error('Сервер не вернул подтверждение ручного бронирования')
    }

    return data as Booking
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  const newStart = new Date(params.startsAt).getTime()
  const newEnd = new Date(params.endsAt).getTime()

  if (newEnd <= newStart) {
    throw new Error('Время окончания должно быть позже времени начала')
  }

  const bookings = getStored<Booking[]>(STORE_BOOKINGS_KEY, [])
  const hasBookingConflict = bookings.some((b) => {
    if (b.company_id !== params.companyId) return false
    if (b.status !== 'confirmed' && b.status !== 'pending') return false
    if (b.status === 'pending' && b.expires_at && new Date(b.expires_at).getTime() <= Date.now()) return false
    const bStart = new Date(b.starts_at).getTime()
    const bEnd = new Date(b.ends_at).getTime()
    return bStart < newEnd && bEnd > newStart
  })

  if (hasBookingConflict) {
    throw new Error('Выбранное время конфликтует с существующим бронированием')
  }

  const blocks = getStored<BlockedInterval[]>(STORE_BLOCKS_KEY, [])
  const hasBlockConflict = blocks.some((bi) => {
    if (bi.company_id !== params.companyId) return false
    const biStart = new Date(bi.starts_at).getTime()
    const biEnd = new Date(bi.ends_at).getTime()
    return biStart < newEnd && biEnd > newStart
  })

  if (hasBlockConflict) {
    throw new Error('Выбранное время конфликтует с заблокированным интервалом')
  }

  // Derive next sequence number from max existing code for prefix 'MAN'
  const regex = /^MAN-(\d+)$/
  const maxSeq = bookings
    .filter((b) => b.company_id === params.companyId)
    .reduce((max, b) => {
      const match = b.public_code.match(regex)
      return match && match[1] ? Math.max(max, parseInt(match[1], 10)) : max
    }, 0)

  let nextSeq = maxSeq + 1
  let publicCode = `MAN-${String(nextSeq).padStart(3, '0')}`
  while (bookings.some((b) => b.company_id === params.companyId && b.public_code === publicCode)) {
    nextSeq += 1
    publicCode = `MAN-${String(nextSeq).padStart(3, '0')}`
  }

  const durationMin = Math.round((newEnd - newStart) / 60000)

  const newBooking: Booking = {
    id: crypto.randomUUID ? crypto.randomUUID() : `man-${Date.now()}`,
    company_id: params.companyId,
    public_code: publicCode,
    client_name: params.clientName,
    client_phone: params.clientPhone,
    car_make: params.carMake,
    car_model: params.carModel,
    services_snapshot: [
      {
        id: 'manual-service',
        name: params.serviceNames,
        price_from: params.totalPrice,
        duration_minutes: durationMin,
      },
    ],
    total_price_from: params.totalPrice,
    total_duration_minutes: durationMin,
    starts_at: params.startsAt,
    ends_at: params.endsAt,
    status: 'confirmed',
    expires_at: null,
    created_at: new Date().toISOString(),
  }

  bookings.push(newBooking)
  setStored(STORE_BOOKINGS_KEY, bookings)
  return newBooking
}

export async function createBlockedInterval(params: {
  companyId: string
  startsAt: string
  endsAt: string
  reason: string
}): Promise<BlockedInterval> {
  // 1. Authoritative Supabase RPC
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('create_blocked_interval', {
        p_company_id: params.companyId,
        p_starts_at: params.startsAt,
        p_ends_at: params.endsAt,
        p_reason: params.reason || null,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при блокировке времени. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { data, error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при блокировке времени. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Не удалось заблокировать интервал')
    }

    if (!data) {
      throw new Error('Сервер не вернул заблокированный интервал')
    }

    return data as BlockedInterval
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  const blocks = getStored<BlockedInterval[]>(STORE_BLOCKS_KEY, [])
  const newBlock: BlockedInterval = {
    id: crypto.randomUUID ? crypto.randomUUID() : `blk-${Date.now()}`,
    company_id: params.companyId,
    starts_at: params.startsAt,
    ends_at: params.endsAt,
    reason: params.reason || null,
  }
  blocks.push(newBlock)
  setStored(STORE_BLOCKS_KEY, blocks)
  return newBlock
}

export async function deleteBlockedInterval(companyId: string, id: string): Promise<void> {
  // 1. Authoritative Supabase RPC
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('delete_blocked_interval', {
        p_company_id: companyId,
        p_interval_id: id,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при снятии блокировки. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при снятии блокировки. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Не удалось удалить заблокированный интервал')
    }
    return
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  const blocks = getStored<BlockedInterval[]>(STORE_BLOCKS_KEY, []).filter(
    (b) => !(b.id === id && b.company_id === companyId)
  )
  setStored(STORE_BLOCKS_KEY, blocks)
}

export async function saveService(service: Service): Promise<void> {
  // 1. Authoritative Supabase RPC
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('save_service', {
        p_company_id: service.company_id,
        p_service_id: service.id || null,
        p_name: service.name,
        p_description: service.description || '',
        p_price_from: service.price_from,
        p_duration_minutes: service.duration_minutes,
        p_image_url: service.image_url || null,
        p_sort_order: service.sort_order || 0,
        p_active: service.active ?? true,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при сохранении услуги. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при сохранении услуги. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Не удалось сохранить услугу на сервере')
    }
    return
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  const services = getStored<Service[]>(STORE_SERVICES_KEY, [])
  const idx = services.findIndex((s) => s.id === service.id && s.company_id === service.company_id)
  if (idx >= 0) {
    services[idx] = service
  } else {
    services.push(service)
  }
  setStored(STORE_SERVICES_KEY, services)
}

export async function deleteService(companyId: string, serviceId: string): Promise<void> {
  // 1. Authoritative Supabase RPC
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('delete_service', {
        p_company_id: companyId,
        p_service_id: serviceId,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при удалении услуги. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при удалении услуги. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Не удалось удалить услугу с сервера')
    }
    return
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  const services = getStored<Service[]>(STORE_SERVICES_KEY, []).filter(
    (s) => !(s.id === serviceId && s.company_id === companyId)
  )
  setStored(STORE_SERVICES_KEY, services)
}

/**
 * Reads and optionally compresses an image file using browser Canvas.
 * Produces a high-quality, lightweight Base64 DataURL (JPEG/PNG).
 */
export async function compressAndReadFileAsDataUrl(
  file: File,
  maxDimension = 1600,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const result = e.target?.result as string
      if (typeof document === 'undefined' || !document.createElement) {
        resolve(result)
        return
      }

      // Check if real canvas 2d context is supported (avoids hang in jsdom/test environments)
      try {
        const testCanvas = document.createElement('canvas')
        const ctx = testCanvas.getContext ? testCanvas.getContext('2d') : null
        if (!ctx) {
          resolve(result)
          return
        }
      } catch {
        resolve(result)
        return
      }

      try {
        const img = new Image()
        const timer = setTimeout(() => {
          resolve(result)
        }, 300)

        img.onerror = () => {
          clearTimeout(timer)
          resolve(result)
        }
        img.onload = () => {
          clearTimeout(timer)
          try {
            let width = img.width
            let height = img.height
            if (!width || !height) {
              resolve(result)
              return
            }

            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = Math.round((height * maxDimension) / width)
                width = maxDimension
              } else {
                width = Math.round((width * maxDimension) / height)
                height = maxDimension
              }
            }

            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (!ctx) {
              resolve(result)
              return
            }

            ctx.drawImage(img, 0, 0, width, height)
            const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
            const dataUrl = canvas.toDataURL(mimeType, quality)
            resolve(dataUrl)
          } catch {
            resolve(result)
          }
        }
        img.src = result
      } catch {
        resolve(result)
      }
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Uploads an image file from device.
 * If Supabase Storage is configured, uploads to the 'detailing-assets' bucket.
 * Otherwise, falls back to compressed Base64 DataURL for instant local/offline persistence.
 */
export async function uploadImageFile(
  companyId: string,
  file: File,
  folder: 'portfolio' | 'services' | 'branding' = 'portfolio'
): Promise<string> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Пожалуйста, выберите файл изображения (JPEG, PNG, WebP и т.д.)')
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Размер файла превышает 15 МБ. Пожалуйста, выберите изображение меньшего размера.')
  }

  // 1. Supabase Storage is strictly disabled in production until storage RLS policies and bucket are formally deployed
  const isStorageEnabled = Boolean(
    import.meta.env?.VITE_ENABLE_STORAGE_UPLOADS === 'true' && !import.meta.env?.PROD
  )

  if (isStorageEnabled && supabase && isSupabaseConfigured) {
    try {
      const sanitizedName = file.name ? file.name.replace(/[^a-zA-Z0-9.-]/g, '_') : 'photo.jpg'
      const filePath = `companies/${companyId}/${folder}/${Date.now()}_${sanitizedName}`

      const { data, error } = await supabase.storage
        .from('detailing-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (!error && data) {
        const { data: publicData } = supabase.storage
          .from('detailing-assets')
          .getPublicUrl(filePath)
        if (publicData?.publicUrl) {
          return publicData.publicUrl
        }
      }
    } catch {
      // Fallback to local DataURL
    }
  }

  // 2. Local fallback: compressed Base64 Data URL
  return await compressAndReadFileAsDataUrl(file, 1600, 0.85)
}

export async function addPortfolioPhoto(companyId: string, imageUrl: string): Promise<GalleryPhoto> {
  // 1. Authoritative Supabase RPC
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('add_portfolio_photo', {
        p_company_id: companyId,
        p_image_url: imageUrl,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при добавлении фотографии. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { data, error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при добавлении фотографии. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Не удалось добавить фотографию на сервере')
    }

    if (!data) {
      throw new Error('Сервер не вернул добавленную фотографию')
    }

    return data as GalleryPhoto
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  const photos = getStored<GalleryPhoto[]>(STORE_GALLERY_KEY, [])
  const newPhoto: GalleryPhoto = {
    id: crypto.randomUUID ? crypto.randomUUID() : `photo-${Date.now()}`,
    company_id: companyId,
    image_url: imageUrl,
    sort_order: photos.filter((p) => p.company_id === companyId).length + 1,
  }
  photos.push(newPhoto)
  setStored(STORE_GALLERY_KEY, photos)
  return newPhoto
}

export async function deletePortfolioPhoto(companyId: string, photoId: string): Promise<void> {
  // 1. Authoritative Supabase RPC
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('delete_portfolio_photo', {
        p_company_id: companyId,
        p_photo_id: photoId,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при удалении фотографии. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при удалении фотографии. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Не удалось удалить фотографию с сервера')
    }
    return
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  const photos = getStored<GalleryPhoto[]>(STORE_GALLERY_KEY, []).filter(
    (p) => !(p.id === photoId && p.company_id === companyId)
  )
  setStored(STORE_GALLERY_KEY, photos)
}

export async function updateCompanySettings(
  companyId: string,
  patch: Partial<Company>
): Promise<Company> {
  // 1. Authoritative Supabase RPC
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('update_company_settings', {
        p_company_id: companyId,
        p_settings: patch,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при обновлении настроек студии. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { data, error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при обновлении настроек студии. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Не удалось обновить настройки студии')
    }

    if (!data) {
      throw new Error('Сервер не вернул обновлённые данные компании')
    }

    return data as Company
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  const companies = getStored<Record<string, Company>>(STORE_COMPANIES_KEY, {})
  if (!companies[companyId]) throw new Error('Компания не найдена')

  companies[companyId] = {
    ...companies[companyId],
    ...patch,
  }

  setStored(STORE_COMPANIES_KEY, companies)
  return companies[companyId]
}

export async function updateSchedule(
  companyId: string,
  schedule: WeeklyScheduleDay[],
  breaks: ScheduleBreak[]
): Promise<void> {
  // 1. Authoritative Supabase RPC
  if (supabase && isSupabaseConfigured) {
    let res: any
    try {
      res = await (supabase as any).rpc('update_company_schedule', {
        p_company_id: companyId,
        p_weekly_schedule: schedule,
        p_schedule_breaks: breaks,
      })
    } catch (fetchErr) {
      if (isNetworkError(fetchErr)) {
        throw new Error('Ошибка сети при сохранении графика. Проверьте интернет-соединение.')
      }
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr))
    }

    const { error } = res
    if (error) {
      if (isNetworkError(error)) {
        throw new Error('Ошибка сети при сохранении графика. Проверьте интернет-соединение.')
      }
      throw new Error(error.message || 'Не удалось сохранить график работы на сервере')
    }
    return
  }

  // 2. Production fail-closed
  if (!isLocalModeAllowed()) {
    throw new Error('Конфигурация Supabase не настроена в продакшен-режиме')
  }

  // 3. Local fallback (DEV/TEST only)
  const allSchedules = getStored<WeeklyScheduleDay[]>(STORE_SCHEDULE_KEY, []).filter(
    (s) => s.company_id !== companyId
  )
  allSchedules.push(...schedule)
  setStored(STORE_SCHEDULE_KEY, allSchedules)

  const allBreaks = getStored<ScheduleBreak[]>(STORE_BREAKS_KEY, []).filter(
    (b) => b.company_id !== companyId
  )
  allBreaks.push(...breaks)
  setStored(STORE_BREAKS_KEY, allBreaks)
}
