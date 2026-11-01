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

interface AuthSession {
  userId: string
  email: string
  companyId: string
  role: 'owner' | 'admin'
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
// PUBLIC FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function getCompanyBySlug(slug: string): Promise<CompanyPublicData | null> {
  const normSlug = slug.toLowerCase().trim()

  // 1. If Supabase is connected, call RPC
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await (supabase as any).rpc('get_company_by_slug', { p_slug: normSlug })
      if (!error && data && data.company) {
        return data as unknown as CompanyPublicData
      }
    } catch {
      // fallback to local store
    }
  }

  // 2. Local fallback
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

  // Check Supabase RPC if configured
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await (supabase as any).rpc('get_available_slots', {
        p_company_id: companyId,
        p_service_ids: serviceIds,
        p_date: dateStr,
      })
      if (!error && Array.isArray(data) && data.length > 0) {
        return data as AvailableSlot[]
      }
    } catch {
      // fallback to local calculation
    }
  }

  // Local calculation
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

function isNetworkError(err: unknown): boolean {
  if (!err) return false
  const msg = err instanceof Error ? err.message : String((err as any)?.message || err)
  return (
    msg.includes('fetch') ||
    msg.includes('Load failed') ||
    msg.includes('NetworkError') ||
    msg.includes('network') ||
    msg.includes('connection') ||
    msg.includes('Failed to load') ||
    msg.includes('abort') ||
    msg.includes('ECONNREFUSED')
  )
}

export async function createBooking(params: {
  companyId: string
  serviceIds: string[]
  clientName: string
  clientPhone: string
  carMake: string
  carModel: string
  startsAt: string // ISO string
}): Promise<Booking> {
  const { companyId, serviceIds, clientName, clientPhone, carMake, carModel, startsAt } = params

  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await (supabase as any).rpc('create_booking', {
        p_company_id: companyId,
        p_service_ids: serviceIds,
        p_client_name: clientName,
        p_client_phone: clientPhone,
        p_car_make: carMake,
        p_car_model: carModel,
        p_starts_at: startsAt,
      })
      if (!error && data) {
        return data as unknown as Booking
      }
      if (error && !isNetworkError(error)) {
        throw new Error(error.message)
      }
    } catch (err) {
      if (err instanceof Error && !isNetworkError(err)) {
        throw err
      }
      // If network error (offline, Docker not running, Safari 'Load failed'), seamlessly fallback to local store!
    }
  }

  // Local fallback
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

  // Verify that interval is still free (concurrency check)
  const bookings = getStored<Booking[]>(STORE_BOOKINGS_KEY, [])
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

  // Public code e.g. DL-002
  const prefix = company.slug.substring(0, 2).toUpperCase()
  const existingCount = bookings.filter((b) => b.company_id === companyId).length + 1
  const publicCode = `${prefix}-${String(existingCount).padStart(3, '0')}`

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

export async function loginOwnerForCompany(
  companyId: string,
  inputLogin: string,
  inputPass: string
): Promise<AuthSession> {
  initializeDetailingStore()
  const creds = getCompanyCredentials(companyId)
  const cleanLogin = (inputLogin || '').trim()
  const cleanPass = (inputPass || '').trim()

  // Strict case & language sensitive comparison:
  // e.g. "Админ" !== "админ", "Админ" !== "Admin"
  if (cleanLogin !== creds.login.trim()) {
    throw new Error('Неверный логин. Обратите внимание на регистр букв и язык ввода.')
  }

  if (cleanPass !== creds.password.trim()) {
    throw new Error('Неверный пароль. Пожалуйста, проверьте введённые данные.')
  }

  const companies = getStored<Record<string, Company>>(STORE_COMPANIES_KEY, {})
  const company = companies[companyId]
  const session: AuthSession = {
    userId: `usr-${companyId.slice(0, 8)}`,
    email: `${cleanLogin}@${company?.slug || 'studio'}.local`,
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

  // 1. Supabase Auth if reachable
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanInput,
        password: cleanPass,
      })
      if (!error && data?.user) {
        const { data: adminRow } = await (supabase as any)
          .from('company_admins')
          .select('company_id, role')
          .eq('user_id', data.user.id)
          .single()

        if (adminRow) {
          const session: AuthSession = {
            userId: data.user.id,
            email: data.user.email || cleanInput,
            companyId: (adminRow as any).company_id,
            role: ((adminRow as any).role as 'owner' | 'admin') || 'owner',
          }
          setStored(STORE_AUTH_KEY, session)
          return session
        }
      }
    } catch {
      // Offline fallback
    }
  }

  // 2. Multi-tenant credentials fallback
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

export function logoutOwner(): void {
  try {
    if (supabase && isSupabaseConfigured) {
      supabase.auth.signOut()
    }
  } catch {
    // ignore
  }
  localStorage.removeItem(STORE_AUTH_KEY)
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
  // If Supabase is configured, sync to DB
  if (supabase && isSupabaseConfigured) {
    try {
      await (supabase as any)
        .from('bookings')
        .update({
          status,
          expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .eq('company_id', companyId)
    } catch {
      // offline fallback
    }
  }

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
}): Promise<Booking> {
  const bookings = getStored<Booking[]>(STORE_BOOKINGS_KEY, [])
  const seq = bookings.filter((b) => b.company_id === params.companyId).length + 1
  const durationMin = Math.round(
    (new Date(params.endsAt).getTime() - new Date(params.startsAt).getTime()) / 60000
  )

  const newBooking: Booking = {
    id: crypto.randomUUID ? crypto.randomUUID() : `man-${Date.now()}`,
    company_id: params.companyId,
    public_code: `MAN-${String(seq).padStart(3, '0')}`,
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
  const blocks = getStored<BlockedInterval[]>(STORE_BLOCKS_KEY, []).filter(
    (b) => !(b.id === id && b.company_id === companyId)
  )
  setStored(STORE_BLOCKS_KEY, blocks)
}

export async function saveService(service: Service): Promise<void> {
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

  // 1. Try Supabase Storage if configured and reachable
  if (supabase && isSupabaseConfigured) {
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
  const photos = getStored<GalleryPhoto[]>(STORE_GALLERY_KEY, []).filter(
    (p) => !(p.id === photoId && p.company_id === companyId)
  )
  setStored(STORE_GALLERY_KEY, photos)
}

export async function updateCompanySettings(
  companyId: string,
  patch: Partial<Company>
): Promise<Company> {
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
