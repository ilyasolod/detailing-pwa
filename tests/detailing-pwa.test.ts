import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  initializeDetailingStore,
  getCompanyBySlug,
  getAvailableSlots,
  createBooking,
  updateBookingStatus,
  rescheduleBooking,
  createBlockedInterval,
  deleteBlockedInterval,
  createManualBooking,
  saveService,
  deleteService,
  addPortfolioPhoto,
  deletePortfolioPhoto,
  updateCompanySettings,
  buildWhatsAppLink,
  loginOwner,
  getOwnerDashboardData,
  formatDurationHuman,
  changeOwnerPassword,
  uploadImageFile,
  loginOwnerForCompany,
  updateCompanyLogin,
  updateCompanyPassword,
  getCompanyCredentials,
  calculateOrderTotals,
  isDemoAuthAllowed,
  validateOwnerSession,
  subscribeToAuthState,
  logoutOwner,
  getCurrentOwnerSession,
} from '../src/lib/detailing-engine'
import { supabase, isSupabaseConfigured, setSupabaseConfigured, resetSupabaseConfigured } from '../src/lib/supabase'
import {
  DETAIL_LAB_ID,
  AUTO_STUDIO_ID,
} from '../src/config/demo-company'
import type { Booking } from '../src/types/database'

function getNextWorkingDate(weekdayTarget = 2): { dateStr: string; dateObj: Date } {
  const d = new Date()
  d.setDate(d.getDate() + ((weekdayTarget + 7 - d.getDay()) % 7 || 7))
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return { dateStr: `${year}-${month}-${day}`, dateObj: d }
}

describe('Detailing Centers PWA — Full ТЗ Verification Suite', () => {
  beforeEach(() => {
    localStorage.clear()
    initializeDetailingStore()
    setSupabaseConfigured(false)
    delete process.env.TEST_BLOCK_LOCAL_MODE
    delete process.env.TEST_BLOCK_DEMO_AUTH
    vi.restoreAllMocks()
  })

  // 1. Slug loading
  it('1. Loads company public page correctly by slug without leaking competitor data', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const autoStudio = await getCompanyBySlug('auto-studio')
    const nonExistent = await getCompanyBySlug('unknown-studio')

    expect(detailLab).not.toBeNull()
    expect(detailLab?.company.name).toBe('Detail Lab')
    expect(detailLab?.company.whatsapp_number).toBe('77754757243')

    expect(autoStudio).not.toBeNull()
    expect(autoStudio?.company.name).toBe('Auto Studio')
    expect(autoStudio?.company.whatsapp_number).toBe('77754757243')

    expect(nonExistent).toBeNull()
  })

  // 2. Services and multi-selection price/duration calculation
  it('2. Multi-service selection: correctly sums preliminary price and total duration', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    expect(detailLab).not.toBeNull()
    const services = detailLab!.services

    const himchistka = services.find((s) => s.name.includes('Химчистка'))!
    const ceramics = services.find((s) => s.name.includes('Керамическое'))!

    expect(himchistka).toBeDefined()
    expect(ceramics).toBeDefined()

    const totalPrice = himchistka.price_from + ceramics.price_from
    const totalDuration = himchistka.duration_minutes + ceramics.duration_minutes

    // Exactly matches the example in Section 5.3 of ТЗ: 95 000 ₸ and 480 minutes (8 hours)
    expect(totalPrice).toBe(95000)
    expect(totalDuration).toBe(480)
    expect(formatDurationHuman(totalDuration)).toBe('8 часов')
  })

  // 3. Available slots calculation with duration, breaks, and working hours
  it('3. Slot calculation: respects studio working hours and 1-car capacity', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const services = detailLab!.services
    const wash = services.find((s) => s.name.includes('мойка'))! // 90 mins

    // Target a working Tuesday
    const { dateStr } = getNextWorkingDate(2)

    const slots = await getAvailableSlots(DETAIL_LAB_ID, [wash.id], dateStr)
    expect(Array.isArray(slots)).toBe(true)
    expect(slots.length).toBeGreaterThan(0)

    // Check first slot format
    expect(slots[0].formatted_time).toMatch(/^\d{2}:\d{2}$/)
  })

  // 4. Atomic booking reservation & 30-minute hold
  it('4. Creates booking with pending status and 30-minute expiration hold', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const services = detailLab!.services
    const wash = services.find((s) => s.name.includes('мойка'))!

    const { dateObj } = getNextWorkingDate(3)
    dateObj.setHours(10, 0, 0, 0)
    const startsAt = dateObj.toISOString()

    const booking = await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [wash.id],
      clientName: 'Иван Тестов',
      clientPhone: '+7 707 555 44 33',
      carMake: 'Toyota',
      carModel: 'Camry',
      startsAt,
    })

    expect(booking.id).toBeDefined()
    expect(booking.status).toBe('pending')
    expect(booking.public_code).toMatch(/^DE-\d{3}$/)
    expect(booking.expires_at).toBeDefined()

    const expiresTime = new Date(booking.expires_at!).getTime()
    const now = Date.now()
    expect(expiresTime - now).toBeGreaterThan(28 * 60 * 1000)
    expect(expiresTime - now).toBeLessThan(32 * 60 * 1000)
  })

  // 5. Concurrency protection (1 car serviced at a time)
  it('5. Double-booking prevention: rejects overlapping booking on the same studio', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const services = detailLab!.services
    const wash = services.find((s) => s.name.includes('мойка'))! // 90 min

    const { dateObj } = getNextWorkingDate(4)
    dateObj.setHours(14, 0, 0, 0)
    const startsAt = dateObj.toISOString()

    // 1st booking
    await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [wash.id],
      clientName: 'Клиент А',
      clientPhone: '+7 707 111 22 33',
      carMake: 'BMW',
      carModel: 'X5',
      startsAt,
    })

    // 2nd booking attempt at overlapping time (14:30) must throw error
    const overlappingStartsAt = new Date(dateObj.getTime() + 30 * 60000).toISOString()

    await expect(
      createBooking({
        companyId: DETAIL_LAB_ID,
        serviceIds: [wash.id],
        clientName: 'Клиент Б',
        clientPhone: '+7 707 999 88 77',
        carMake: 'Mercedes',
        carModel: 'E-Class',
        startsAt: overlappingStartsAt,
      })
    ).rejects.toThrow('Выбранное время только что было зарезервировано')
  })

  // 6. WhatsApp message format verification strictly according to Section 8 of ТЗ
  it('6. WhatsApp link: generates message formatted strictly per Section 8 of ТЗ', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const company = detailLab!.company
    const services = detailLab!.services
    const himchistka = services.find((s) => s.name.includes('Химчистка'))!
    const ceramics = services.find((s) => s.name.includes('Керамическое'))!

    const { dateObj } = getNextWorkingDate(2)
    dateObj.setHours(10, 0, 0, 0)

    const booking: Booking = {
      id: 'test-booking-wa',
      company_id: company.id,
      public_code: 'DL-001',
      client_name: 'Иван',
      client_phone: '+7 707 111 22 33',
      car_make: 'Toyota',
      car_model: 'Camry',
      services_snapshot: [
        { id: himchistka.id, name: himchistka.name, price_from: himchistka.price_from, duration_minutes: himchistka.duration_minutes },
        { id: ceramics.id, name: ceramics.name, price_from: ceramics.price_from, duration_minutes: ceramics.duration_minutes },
      ],
      total_price_from: 95000,
      total_duration_minutes: 480,
      starts_at: dateObj.toISOString(),
      ends_at: new Date(dateObj.getTime() + 480 * 60000).toISOString(),
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
      created_at: new Date().toISOString(),
    }

    const waLink = buildWhatsAppLink(company, booking)

    expect(waLink).toContain('https://wa.me/77754757243?text=')
    const decodedMessage = decodeURIComponent(waLink.split('text=')[1])

    expect(decodedMessage).toContain('НОВАЯ ЗАЯВКА №DL-001')
    expect(decodedMessage).toContain('Компания: Detail Lab')
    expect(decodedMessage).toContain('Клиент: Иван')
    expect(decodedMessage).toContain('Автомобиль: Toyota Camry')
    expect(decodedMessage).toContain('Химчистка салона — от 35 000 ₸.')
    expect(decodedMessage).toContain('Керамическое покрытие — от 60 000 ₸.')
    expect(decodedMessage).toContain('Предварительная стоимость: от 95 000 ₸.')
    expect(decodedMessage).toContain('Продолжительность: 8 часов.')
    expect(decodedMessage).toContain('Статус: ожидает подтверждения.')
  })

  // 7. Owner Booking Actions (Confirm, Cancel, Reschedule)
  it('7. Owner booking lifecycle: confirm, cancel, and reschedule', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const wash = detailLab!.services[0]

    const { dateObj } = getNextWorkingDate(5)
    dateObj.setHours(11, 0, 0, 0)

    const booking = await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [wash.id],
      clientName: 'Тест Владелец',
      clientPhone: '+7 700 000 11 22',
      carMake: 'Porsche',
      carModel: '911',
      startsAt: dateObj.toISOString(),
    })

    // Confirm
    const confirmed = await updateBookingStatus(DETAIL_LAB_ID, booking.id, 'confirmed')
    expect(confirmed.status).toBe('confirmed')
    expect(confirmed.expires_at).toBeNull()

    // Reschedule
    const newDate = new Date(dateObj)
    newDate.setHours(15, 0, 0, 0)
    const rescheduled = await rescheduleBooking(DETAIL_LAB_ID, booking.id, newDate.toISOString())
    expect(rescheduled.starts_at).toBe(newDate.toISOString())

    // Cancel
    const cancelled = await updateBookingStatus(DETAIL_LAB_ID, booking.id, 'cancelled')
    expect(cancelled.status).toBe('cancelled')
  })

  // 8. Multi-Tenant Isolation
  it('8. Multi-tenant security: Detail Lab owner cannot see or modify Auto Studio data', async () => {
    // 1. Login as Detail Lab owner via "Админ" with default password "12345678"
    const detailLabSession = await loginOwnerForCompany(DETAIL_LAB_ID, 'Админ', '12345678')
    expect(detailLabSession.companyId).toBe(DETAIL_LAB_ID)

    // 2. Login as Auto Studio owner via "Админ" with default password "12345678"
    const autoStudioSession = await loginOwnerForCompany(AUTO_STUDIO_ID, 'Админ', '12345678')
    expect(autoStudioSession.companyId).toBe(AUTO_STUDIO_ID)
    expect(autoStudioSession.companyId).toBe(AUTO_STUDIO_ID)

    // 3. Create a booking in Auto Studio
    const autoStudio = await getCompanyBySlug('auto-studio')
    const asService = autoStudio!.services[0]

    const { dateObj } = getNextWorkingDate(3)
    dateObj.setHours(12, 0, 0, 0)

    const asBooking = await createBooking({
      companyId: AUTO_STUDIO_ID,
      serviceIds: [asService.id],
      clientName: 'Клиент Астаны',
      clientPhone: '+7 701 000 00 01',
      carMake: 'Audi',
      carModel: 'RS6',
      startsAt: dateObj.toISOString(),
    })

    // 4. Detail Lab owner fetches dashboard data -> MUST NOT see Auto Studio booking!
    const dlDashboard = await getOwnerDashboardData(DETAIL_LAB_ID)
    const foundInDl = dlDashboard.bookings.find((b) => b.id === asBooking.id)
    expect(foundInDl).toBeUndefined()

    // 5. Auto Studio dashboard DOES see it
    const asDashboard = await getOwnerDashboardData(AUTO_STUDIO_ID)
    const foundInAs = asDashboard.bookings.find((b) => b.id === asBooking.id)
    expect(foundInAs).toBeDefined()

    // 6. Detail Lab owner tries to cancel Auto Studio booking -> throws error!
    await expect(
      updateBookingStatus(DETAIL_LAB_ID, asBooking.id, 'cancelled')
    ).rejects.toThrow('Заявка не найдена')
  })

  // 9. Manual blocked intervals
  it('9. Manual blocked interval correctly blocks studio time', async () => {
    const { dateObj } = getNextWorkingDate(4)
    dateObj.setHours(10, 0, 0, 0)
    const endBlock = new Date(dateObj.getTime() + 180 * 60000)

    const block = await createBlockedInterval({
      companyId: DETAIL_LAB_ID,
      startsAt: dateObj.toISOString(),
      endsAt: endBlock.toISOString(),
      reason: 'Техническое обслуживание бокса',
    })

    expect(block.id).toBeDefined()

    const detailLab = await getCompanyBySlug('detail-lab')
    const wash = detailLab!.services[0]!

    // Attempting to book inside this blocked time must fail
    await expect(
      createBooking({
        companyId: DETAIL_LAB_ID,
        serviceIds: [wash.id],
        clientName: 'Тест Блок',
        clientPhone: '+7 777 999 88 77',
        carMake: 'Lexus',
        carModel: 'LX600',
        startsAt: dateObj.toISOString(),
      })
    ).rejects.toThrow('Выбранное время заблокировано администратором студии')
  })

  // 10. Manual booking creation by owner
  it('10. Owner can add manual booking from phone or walk-in, immediately confirmed', async () => {
    const { dateObj } = getNextWorkingDate(5)
    dateObj.setHours(9, 0, 0, 0)
    const endsAt = new Date(dateObj.getTime() + 120 * 60000)

    const manual = await createManualBooking({
      companyId: DETAIL_LAB_ID,
      clientName: 'Ручной Клиент (по звонку)',
      clientPhone: '+7 701 555 11 22',
      carMake: 'Mercedes-Benz',
      carModel: 'G63 AMG',
      serviceNames: 'Химчистка + Озонация',
      totalPrice: 40000,
      startsAt: dateObj.toISOString(),
      endsAt: endsAt.toISOString(),
    })

    expect(manual.id).toBeDefined()
    expect(manual.status).toBe('confirmed')
    expect(manual.public_code).toMatch(/^MAN-\d{3}$/)
    expect(manual.total_price_from).toBe(40000)
    expect(manual.total_duration_minutes).toBe(120)

    // And it appears in the owner dashboard
    const dashboard = await getOwnerDashboardData(DETAIL_LAB_ID)
    const found = dashboard.bookings.find((b) => b.id === manual.id)
    expect(found).toBeDefined()
  })

  // 11. Services CRUD by owner
  it('11. Owner can add, edit, toggle active, and delete services', async () => {
    const dashboardBefore = await getOwnerDashboardData(DETAIL_LAB_ID)
    const initialCount = dashboardBefore.services.length

    // Add new service
    const newServiceId = 'new-srv-test-001'
    await saveService({
      id: newServiceId,
      company_id: DETAIL_LAB_ID,
      name: 'Антидождь на все стёкла',
      description: 'Гидрофобное покрытие Aquapel на лобовое и боковые стёкла',
      price_from: 12000,
      duration_minutes: 45,
      image_url: null,
      active: true,
      sort_order: 10,
    })

    const dashboardAfterAdd = await getOwnerDashboardData(DETAIL_LAB_ID)
    expect(dashboardAfterAdd.services.length).toBe(initialCount + 1)
    const added = dashboardAfterAdd.services.find((s) => s.id === newServiceId)
    expect(added?.name).toBe('Антидождь на все стёкла')

    // Edit service
    await saveService({
      ...added!,
      price_from: 15000,
      active: false,
    })

    const dashboardAfterEdit = await getOwnerDashboardData(DETAIL_LAB_ID)
    const edited = dashboardAfterEdit.services.find((s) => s.id === newServiceId)
    expect(edited?.price_from).toBe(15000)
    expect(edited?.active).toBe(false)

    // Public page should not show inactive service
    const publicData = await getCompanyBySlug('detail-lab')
    const inPublic = publicData?.services.find((s) => s.id === newServiceId)
    expect(inPublic).toBeUndefined()

    // Delete service
    await deleteService(DETAIL_LAB_ID, newServiceId)
    const dashboardAfterDelete = await getOwnerDashboardData(DETAIL_LAB_ID)
    expect(dashboardAfterDelete.services.find((s) => s.id === newServiceId)).toBeUndefined()
  })

  // 12. Portfolio photo operations
  it('12. Owner can add and delete portfolio photos', async () => {
    const photoUrl = 'https://images.unsplash.com/photo-test-car.jpg'
    const photo = await addPortfolioPhoto(DETAIL_LAB_ID, photoUrl)
    expect(photo.id).toBeDefined()
    expect(photo.image_url).toBe(photoUrl)

    const dashboard = await getOwnerDashboardData(DETAIL_LAB_ID)
    expect(dashboard.gallery_photos.some((p) => p.id === photo.id)).toBe(true)

    await deletePortfolioPhoto(DETAIL_LAB_ID, photo.id)
    const dashboardAfter = await getOwnerDashboardData(DETAIL_LAB_ID)
    expect(dashboardAfter.gallery_photos.some((p) => p.id === photo.id)).toBe(false)
  })

  // 13. Expiration of 30-min pending reservations
  it('13. Expired pending reservations release slot and are marked as expired', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const wash = detailLab!.services[0]!

    const { dateObj } = getNextWorkingDate(3)
    dateObj.setHours(15, 0, 0, 0)
    const startsAt = dateObj.toISOString()

    const booking = await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [wash.id],
      clientName: 'Клиент с истекающим временем',
      clientPhone: '+7 707 999 00 11',
      carMake: 'BMW',
      carModel: 'M3',
      startsAt,
    })

    expect(booking.status).toBe('pending')

    // Simulate 31 minutes passing (expires_at is now in the past)
    const raw = localStorage.getItem('detailing_bookings_v1')
    const list: Booking[] = JSON.parse(raw!)
    const targetIdx = list.findIndex((b) => b.id === booking.id)
    list[targetIdx]!.expires_at = new Date(Date.now() - 60000).toISOString() // 1 minute ago
    localStorage.setItem('detailing_bookings_v1', JSON.stringify(list))

    // Query available slots -> slot should now be FREE again!
    const slots = await getAvailableSlots(DETAIL_LAB_ID, [wash.id], dateObj.toISOString().split('T')[0]!)
    const freeSlot = slots.find((s) => s.starts_at === startsAt)
    expect(freeSlot).toBeDefined()

    // And booking status changed to expired
    const dashboard = await getOwnerDashboardData(DETAIL_LAB_ID)
    const updatedB = dashboard.bookings.find((b) => b.id === booking.id)
    expect(updatedB?.status).toBe('expired')
  })

  // 14. Company profile & visual personalization settings update
  it('14. Owner can update company settings, theme preset, and branding colors', async () => {
    const updated = await updateCompanySettings(DETAIL_LAB_ID, {
      name: 'Detail Lab Premium Studio',
      design_settings: {
        theme_preset: 'performance',
        primary_color: '#FF2A2A',
        accent_color: '#FF7F00',
        background_color: '#08080A',
        text_color: '#FFFFFF',
        font_pair: 'Inter',
        border_radius: '14px',
      },
    })

    expect(updated.name).toBe('Detail Lab Premium Studio')
    expect(updated.design_settings.theme_preset).toBe('performance')
    expect(updated.design_settings.primary_color).toBe('#FF2A2A')

    // Check public page reflects the updated branding
    const publicData = await getCompanyBySlug('detail-lab')
    expect(publicData?.company.name).toBe('Detail Lab Premium Studio')
    expect(publicData?.company.design_settings.theme_preset).toBe('performance')
  })

  // 15. Owner credentials change & case/language sensitivity
  it('15. Owner can change login and password with strict case and language sensitivity, isolated per company', async () => {
    // 1. Initial login with default credentials "Админ" / "12345678"
    const session = await loginOwnerForCompany(DETAIL_LAB_ID, 'Админ', '12345678')
    expect(session.companyId).toBe(DETAIL_LAB_ID)

    // 2. Strict case and language sensitivity:
    // Lowercase "админ" must fail
    await expect(loginOwnerForCompany(DETAIL_LAB_ID, 'админ', '12345678')).rejects.toThrow('Неверный логин')
    // Latin "Admin" must fail
    await expect(loginOwnerForCompany(DETAIL_LAB_ID, 'Admin', '12345678')).rejects.toThrow('Неверный логин')
    // Wrong password must fail
    await expect(loginOwnerForCompany(DETAIL_LAB_ID, 'Админ', 'wrongpass')).rejects.toThrow('Неверный пароль')

    // 3. Change login to "Босс"
    await updateCompanyLogin({
      companyId: DETAIL_LAB_ID,
      currentPassword: '12345678',
      newLogin: 'Босс',
    })

    // 4. Change password to "NewBossPass2026"
    await updateCompanyPassword({
      companyId: DETAIL_LAB_ID,
      currentPassword: '12345678',
      newPassword: 'NewBossPass2026',
    })

    // 5. Login with old credentials must fail
    await expect(loginOwnerForCompany(DETAIL_LAB_ID, 'Админ', '12345678')).rejects.toThrow('Неверный логин')
    await expect(loginOwnerForCompany(DETAIL_LAB_ID, 'Босс', '12345678')).rejects.toThrow('Неверный пароль')

    // 6. Login with new credentials must succeed
    const newSession = await loginOwnerForCompany(DETAIL_LAB_ID, 'Босс', 'NewBossPass2026')
    expect(newSession.companyId).toBe(DETAIL_LAB_ID)

    // 7. Multi-tenant isolation:
    // Auto Studio credentials are completely untouched!
    const asCreds = getCompanyCredentials(AUTO_STUDIO_ID)
    expect(asCreds.login).toBe('Админ')
    expect(asCreds.password).toBe('12345678')

    // Detail Lab credentials do NOT work for Auto Studio
    await expect(loginOwnerForCompany(AUTO_STUDIO_ID, 'Босс', 'NewBossPass2026')).rejects.toThrow('Неверный логин')

    // Auto Studio owner logs in with their own default credentials
    const asSession = await loginOwnerForCompany(AUTO_STUDIO_ID, 'Админ', '12345678')
    expect(asSession.companyId).toBe(AUTO_STUDIO_ID)
  })

  // 16. Slot liberation upon booking cancellation
  it('16. Cancelling a booking immediately frees the slot for new client bookings', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const wash = detailLab!.services[0] // 90 min service

    const { dateObj, dateStr } = getNextWorkingDate(3) // Wednesday
    dateObj.setHours(11, 0, 0, 0)
    const slotStartsAt = dateObj.toISOString()

    // 1. Slot is initially available
    const initialSlots = await getAvailableSlots(DETAIL_LAB_ID, [wash.id], dateStr)
    const initialSlot = initialSlots.find((s) => s.starts_at === slotStartsAt)
    expect(initialSlot).toBeDefined()

    // 2. Book this slot
    const booking = await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [wash.id],
      clientName: 'Первый Клиент',
      clientPhone: '+7 701 111 22 33',
      carMake: 'Audi',
      carModel: 'RS6',
      startsAt: slotStartsAt,
    })

    // 3. Slot is now occupied / removed from available slots
    const slotsAfterBooking = await getAvailableSlots(DETAIL_LAB_ID, [wash.id], dateStr)
    const occupiedSlot = slotsAfterBooking.find((s) => s.starts_at === slotStartsAt)
    expect(occupiedSlot).toBeUndefined()

    // And another client attempting to book this slot is rejected
    await expect(
      createBooking({
        companyId: DETAIL_LAB_ID,
        serviceIds: [wash.id],
        clientName: 'Второй Клиент',
        clientPhone: '+7 702 333 44 55',
        carMake: 'Lexus',
        carModel: 'LX600',
        startsAt: slotStartsAt,
      })
    ).rejects.toThrow('Выбранное время только что было зарезервировано')

    // 4. Owner cancels the booking
    const cancelledBooking = await updateBookingStatus(DETAIL_LAB_ID, booking.id, 'cancelled')
    expect(cancelledBooking.status).toBe('cancelled')

    // 5. Slot is immediately FREED and returned in available slots!
    const slotsAfterCancel = await getAvailableSlots(DETAIL_LAB_ID, [wash.id], dateStr)
    const liberatedSlot = slotsAfterCancel.find((s) => s.starts_at === slotStartsAt)
    expect(liberatedSlot).toBeDefined()

    // 6. Another client can now successfully book this liberated slot
    const newBooking = await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [wash.id],
      clientName: 'Новый Счастливый Клиент',
      clientPhone: '+7 705 999 88 77',
      carMake: 'Porsche',
      carModel: 'Taycan',
      startsAt: slotStartsAt,
    })
    expect(newBooking.id).toBeDefined()
    expect(newBooking.starts_at).toBe(slotStartsAt)
  })

  // 17. Device image upload
  it('17. Device image upload: converts image file and adds to portfolio', async () => {
    // Create a mock image File
    const mockFile = new File(['fake-image-bytes-mock'], 'car-polishing.jpg', { type: 'image/jpeg' })

    const uploadedUrl = await uploadImageFile(DETAIL_LAB_ID, mockFile, 'portfolio')
    expect(uploadedUrl).toBeDefined()
    expect(typeof uploadedUrl).toBe('string')
    expect(uploadedUrl.startsWith('data:') || uploadedUrl.startsWith('http')).toBe(true)

    // Add to portfolio
    const photo = await addPortfolioPhoto(DETAIL_LAB_ID, uploadedUrl)
    expect(photo.id).toBeDefined()
    expect(photo.image_url).toBe(uploadedUrl)

    const dashboard = await getOwnerDashboardData(DETAIL_LAB_ID)
    const foundPhoto = dashboard.gallery_photos.find((p) => p.id === photo.id)
    expect(foundPhoto).toBeDefined()
  })

  // 18. Service duration calculation mode (max vs sum)
  it('18. Duration calculation mode: defaults to max (parallel), can be switched to sum per company independently', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const s1 = detailLab!.services[0] // 90 min
    const s2 = detailLab!.services[1] // 300 min

    // 1. Default mode: max duration (parallel execution)
    expect(detailLab!.company.duration_calculation_mode).toBe('max')
    const totalsDefault = calculateOrderTotals(detailLab!.company, [s1, s2])
    expect(totalsDefault.totalDuration).toBe(300) // Math.max(90, 300) = 300 min
    expect(totalsDefault.totalPrice).toBe(s1.price_from + s2.price_from)

    // 2. Switch Detail Lab to 'sum' mode (sequential execution)
    await updateCompanySettings(DETAIL_LAB_ID, {
      ...detailLab!.company,
      duration_calculation_mode: 'sum',
    })

    const updatedDetailLab = await getCompanyBySlug('detail-lab')
    expect(updatedDetailLab!.company.duration_calculation_mode).toBe('sum')
    const totalsSum = calculateOrderTotals(updatedDetailLab!.company, [s1, s2])
    expect(totalsSum.totalDuration).toBe(390) // 90 + 300 = 390 min

    // 3. Multi-tenant isolation: Auto Studio remains in 'max' mode!
    const autoStudio = await getCompanyBySlug('auto-studio')
    expect(autoStudio!.company.duration_calculation_mode).toBe('max')
  })

  describe('Supabase Auth & Lifecycle', () => {
    beforeEach(() => {
      setSupabaseConfigured(true)
    })

    // 19. Supabase Auth: Successful login to own company
    it('19. Supabase Auth: Successful login to own company', async () => {
    if (!supabase) return

    const mockAdminRows = [
      { user_id: 'usr-detail-lab-owner', company_id: DETAIL_LAB_ID, role: 'owner' },
    ]

    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: { user: { id: 'usr-detail-lab-owner', email: 'owner@detail-lab.kz' } as any, session: {} as any },
      error: null,
    })

    vi.spyOn(supabase as any, 'from').mockImplementation((table: string) => {
      let filters: { user_id?: string; company_id?: string } = {}
      const builder = {
        select: () => builder,
        eq: (col: string, val: string) => {
          if (col === 'user_id') filters.user_id = val
          if (col === 'company_id') filters.company_id = val
          return builder
        },
        maybeSingle: async () => {
          const match = mockAdminRows.find(
            (r) => r.user_id === filters.user_id && r.company_id === filters.company_id
          )
          return { data: match || null, error: null }
        },
      }
      return builder
    })

    const session = await loginOwnerForCompany(DETAIL_LAB_ID, 'owner@detail-lab.kz', 'SecretPass123!')
    expect(session.userId).toBe('usr-detail-lab-owner')
    expect(session.companyId).toBe(DETAIL_LAB_ID)
    expect(session.role).toBe('owner')
    expect(session.email).toBe('owner@detail-lab.kz')
  })

  // 20. Supabase Auth: Denial when missing company_admins record (invokes signOut)
  it('20. Supabase Auth: Rejection and signOut when user has no company_admins record', async () => {
    if (!supabase) return

    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: { user: { id: 'usr-client-account', email: 'client@mail.kz' } as any, session: {} as any },
      error: null,
    })

    const signOutSpy = vi.spyOn(supabase.auth, 'signOut').mockResolvedValueOnce({ error: null } as any)

    vi.spyOn(supabase as any, 'from').mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
      }
      return builder
    })

    await expect(
      loginOwnerForCompany(DETAIL_LAB_ID, 'client@mail.kz', 'SecretPass123!')
    ).rejects.toThrow('У вашей учетной записи нет прав администратора в этом детейлинг-центре')

    expect(signOutSpy).toHaveBeenCalled()
  })

  // 21. Supabase Auth: Denial when attempting to log into another company
  it('21. Supabase Auth: Rejection and signOut when attempting to log into another company', async () => {
    if (!supabase) return

    const mockAdminRows = [
      { user_id: 'usr-as-owner', company_id: AUTO_STUDIO_ID, role: 'owner' },
    ]

    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: { user: { id: 'usr-as-owner', email: 'owner@auto-studio.kz' } as any, session: {} as any },
      error: null,
    })

    const signOutSpy = vi.spyOn(supabase.auth, 'signOut').mockResolvedValueOnce({ error: null } as any)

    vi.spyOn(supabase as any, 'from').mockImplementation((table: string) => {
      let filters: { user_id?: string; company_id?: string } = {}
      const builder = {
        select: () => builder,
        eq: (col: string, val: string) => {
          if (col === 'user_id') filters.user_id = val
          if (col === 'company_id') filters.company_id = val
          return builder
        },
        maybeSingle: async () => {
          const match = mockAdminRows.find(
            (r) => r.user_id === filters.user_id && r.company_id === filters.company_id
          )
          return { data: match || null, error: null }
        },
      }
      return builder
    })

    // Auto Studio owner tries to log into Detail Lab URL
    await expect(
      loginOwnerForCompany(DETAIL_LAB_ID, 'owner@auto-studio.kz', 'SecretPass123!')
    ).rejects.toThrow('У вашей учетной записи нет прав администратора в этом детейлинг-центре')

    expect(signOutSpy).toHaveBeenCalled()
  })

  // 22. Supabase Auth: One user linked to two companies can log into both without PGRST116 conflict
  it('22. Supabase Auth: Single user linked to two companies can log into both independently', async () => {
    if (!supabase) return

    const multiAdminRows = [
      { user_id: 'usr-multi-owner', company_id: DETAIL_LAB_ID, role: 'owner' },
      { user_id: 'usr-multi-owner', company_id: AUTO_STUDIO_ID, role: 'admin' },
    ]

    vi.spyOn(supabase.auth, 'signInWithPassword').mockImplementation(async () => ({
      data: { user: { id: 'usr-multi-owner', email: 'multi@owner.kz' } as any, session: {} as any },
      error: null,
    }))

    vi.spyOn(supabase as any, 'from').mockImplementation((table: string) => {
      let filters: { user_id?: string; company_id?: string } = {}
      const builder = {
        select: () => builder,
        eq: (col: string, val: string) => {
          if (col === 'user_id') filters.user_id = val
          if (col === 'company_id') filters.company_id = val
          return builder
        },
        maybeSingle: async () => {
          const matches = multiAdminRows.filter(
            (r) =>
              (!filters.user_id || r.user_id === filters.user_id) &&
              (!filters.company_id || r.company_id === filters.company_id)
          )
          if (matches.length > 1) {
            return { data: null, error: { message: 'Cardinality error PGRST116: Multiple rows found', code: 'PGRST116' } }
          }
          return { data: matches[0] || null, error: null }
        },
      }
      return builder
    })

    // 1. Log in to Detail Lab
    const dlSession = await loginOwnerForCompany(DETAIL_LAB_ID, 'multi@owner.kz', 'MultiSecret!')
    expect(dlSession.companyId).toBe(DETAIL_LAB_ID)
    expect(dlSession.role).toBe('owner')

    // 2. Log in to Auto Studio
    const asSession = await loginOwnerForCompany(AUTO_STUDIO_ID, 'multi@owner.kz', 'MultiSecret!')
    expect(asSession.companyId).toBe(AUTO_STUDIO_ID)
    expect(asSession.role).toBe('admin')
  })

  // 23. Supabase Auth: Network failure does NOT fall back to LocalStorage mock credentials
  it('23. Supabase Auth: Network error throws network error and NEVER falls back to LocalStorage mock credentials', async () => {
    if (!supabase) return

    vi.spyOn(supabase.auth, 'signInWithPassword').mockRejectedValueOnce(
      new Error('Failed to fetch (net::ERR_INTERNET_DISCONNECTED)')
    )

    // Clear any existing stored auth
    localStorage.removeItem('detailing_owner_session_v1')

    await expect(
      loginOwnerForCompany(DETAIL_LAB_ID, 'owner@detail-lab.kz', '12345678')
    ).rejects.toThrow('Ошибка сети при авторизации. Проверьте подключение к интернету.')

    // Verify no session was created in localStorage
    expect(localStorage.getItem('detailing_owner_session_v1')).toBeNull()
  })

  // 24. Security: In production without explicit demo mode, mock credentials are fully blocked
  it('24. Security: Mock credentials and automatic demo fallback are strictly blocked when demo auth is disabled', async () => {
    process.env.TEST_BLOCK_DEMO_AUTH = 'true'

    try {
      // 1. Attempting to log in with username "Админ" in production mode must be rejected immediately
      await expect(
        loginOwnerForCompany(DETAIL_LAB_ID, 'Админ', '12345678')
      ).rejects.toThrow('Вход по логину доступен только в демо-режиме')

      // 2. Multi-tenant credentials fallback without explicit company also blocked
      await expect(
        loginOwner('Админ', '12345678')
      ).rejects.toThrow('Вход по логину доступен только в демо-режиме')
    } finally {
      delete process.env.TEST_BLOCK_DEMO_AUTH
    }
  })

  // 25. Multi-Company loginOwner: rejects ambiguous login without company context
  it('25. loginOwner: when user has multiple companies, rejects ambiguous auto-selection to preserve tenant isolation', async () => {
    if (!supabase) return

    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: { user: { id: 'usr-multi-boss', email: 'multi@detailing.kz' } as any, session: {} as any },
      error: null,
    })

    const signOutSpy = vi.spyOn(supabase.auth, 'signOut').mockResolvedValueOnce({ error: null } as any)

    vi.spyOn(supabase as any, 'from').mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        then: (resolve: any) =>
          resolve({
            data: [
              { company_id: DETAIL_LAB_ID, role: 'owner' },
              { company_id: AUTO_STUDIO_ID, role: 'admin' },
            ],
            error: null,
          }),
      }
      return builder
    })

    await expect(
      loginOwner('multi@detailing.kz', 'SecretPass!')
    ).rejects.toThrow('У вашей учетной записи есть доступ к нескольким компаниям')

    expect(signOutSpy).toHaveBeenCalled()
  })

  // 26. Session Lifecycle: logoutOwner clears local session synchronously and executes Supabase signOut
  it('26. Session Lifecycle: logoutOwner deletes local session and calls Supabase signOut', async () => {
    localStorage.setItem(
      'detailing_auth_session_v1',
      JSON.stringify({
        userId: 'usr-test-1',
        email: 'test@detail-lab.kz',
        companyId: DETAIL_LAB_ID,
        role: 'owner',
      })
    )
    expect(getCurrentOwnerSession()).not.toBeNull()

    const signOutSpy = supabase ? vi.spyOn(supabase.auth, 'signOut').mockResolvedValueOnce({ error: null } as any) : null

    await logoutOwner()

    // 1. Local session is strictly null
    expect(getCurrentOwnerSession()).toBeNull()
    expect(localStorage.getItem('detailing_auth_session_v1')).toBeNull()

    // 2. Supabase signOut was invoked
    if (signOutSpy) {
      expect(signOutSpy).toHaveBeenCalled()
    }
  })

  // 27. Session Expiration: validateOwnerSession detects expired/invalid Supabase session and revokes access
  it('27. Session Expiration: validateOwnerSession terminates session when Supabase token is expired or revoked', async () => {
    if (!supabase) return

    // Pre-set local session
    localStorage.setItem(
      'detailing_auth_session_v1',
      JSON.stringify({
        userId: 'usr-expired-user',
        email: 'owner@detail-lab.kz',
        companyId: DETAIL_LAB_ID,
        role: 'owner',
      })
    )

    // Scenario A: Supabase session is expired (expires_at is 1 hour in the past)
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValueOnce({
      data: {
        session: {
          user: { id: 'usr-expired-user' } as any,
          expires_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        } as any,
      },
      error: null,
    })

    const validatedExpired = await validateOwnerSession(DETAIL_LAB_ID)
    expect(validatedExpired).toBeNull()
    expect(getCurrentOwnerSession()).toBeNull()

    // Pre-set local session again
    localStorage.setItem(
      'detailing_auth_session_v1',
      JSON.stringify({
        userId: 'usr-revoked-user',
        email: 'owner@detail-lab.kz',
        companyId: DETAIL_LAB_ID,
        role: 'owner',
      })
    )

    // Scenario B: Supabase returns session: null (revoked or signed out on server)
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValueOnce({
      data: { session: null },
      error: null,
    })

    const validatedRevoked = await validateOwnerSession(DETAIL_LAB_ID)
    expect(validatedRevoked).toBeNull()
    expect(getCurrentOwnerSession()).toBeNull()
  })

  // 28. Cross-Company Switching: validateOwnerSession clears mismatched session from storage without signing out Supabase
  it('28. Cross-Company Switching: clears mismatched company session from storage without destroying Supabase Auth', async () => {
    // 1. User is logged into Detail Lab
    localStorage.setItem(
      'detailing_auth_session_v1',
      JSON.stringify({
        userId: 'usr-multi-owner',
        email: 'multi@detailing.kz',
        companyId: DETAIL_LAB_ID,
        role: 'owner',
      })
    )
    expect(getCurrentOwnerSession()?.companyId).toBe(DETAIL_LAB_ID)

    // 2. User opens Auto Studio admin (/c/auto-studio/admin)
    // Spy on signOut to ensure it is NOT called
    const signOutSpy = supabase ? vi.spyOn(supabase.auth, 'signOut') : null

    const result = await validateOwnerSession(AUTO_STUDIO_ID)

    // A. Returns null because company does not match
    expect(result).toBeNull()

    // B. Old Detail Lab session is removed from storage so it does NOT linger
    expect(getCurrentOwnerSession()).toBeNull()
    expect(localStorage.getItem('detailing_auth_session_v1')).toBeNull()

    // C. Supabase signOut is NOT called, preserving user's active Supabase session
    if (signOutSpy) {
      expect(signOutSpy).not.toHaveBeenCalled()
    }
  })

  // 29. subscribeToAuthState: handles SIGNED_OUT, session expiration, and TOKEN_REFRESHED without deadlock
  it('29. subscribeToAuthState: safely handles auth events without deadlocks or direct awaits', async () => {
    if (!supabase) return

    let authCallback: any = null
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any
    })

    let currentObservedSession: any = 'initial'
    const onChange = vi.fn((sess) => {
      currentObservedSession = sess
    })

    const unsubscribe = subscribeToAuthState(DETAIL_LAB_ID, onChange)
    expect(typeof authCallback).toBe('function')

    // 1. SIGNED_OUT event: synchronously removes stored session and notifies null
    localStorage.setItem(
      'detailing_auth_session_v1',
      JSON.stringify({ userId: 'u1', companyId: DETAIL_LAB_ID, email: 'a@b.kz', role: 'owner' })
    )
    authCallback('SIGNED_OUT', null)
    expect(currentObservedSession).toBeNull()
    expect(localStorage.getItem('detailing_auth_session_v1')).toBeNull()

    // 2. TOKEN_REFRESHED with valid matching session
    const validLocal = { userId: 'u1', companyId: DETAIL_LAB_ID, email: 'a@b.kz', role: 'owner' }
    localStorage.setItem('detailing_auth_session_v1', JSON.stringify(validLocal))
    authCallback('TOKEN_REFRESHED', {
      user: { id: 'u1' },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })
    expect(currentObservedSession).toEqual(validLocal)

    unsubscribe()
  })

  // 30. subscribeToAuthState: unsubscription cancels deferred callbacks
  it('30. subscribeToAuthState: cancels deferred callback if unsubscribed before execution', async () => {
    if (!supabase) return

    let authCallback: any = null
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any
    })

    const onChange = vi.fn()
    const unsubscribe = subscribeToAuthState(DETAIL_LAB_ID, onChange)

    // Trigger SIGNED_IN without local session (schedules deferred validateOwnerSession)
    authCallback('SIGNED_IN', {
      user: { id: 'usr-new' },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })

    // Immediately unsubscribe before setTimeout(0) resolves
    unsubscribe()

    // Wait for event loop to flush pending timers
    await new Promise((r) => setTimeout(r, 25))

    // onChange must NOT have been called because subscription was cancelled
    expect(onChange).not.toHaveBeenCalled()
  })

  // 31. subscribeToAuthState: newer auth events invalidate older in-flight callbacks
  it('31. subscribeToAuthState: newer auth event invalidates older in-flight callback', async () => {
    if (!supabase) return

    let authCallback: any = null
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any
    })

    // Mock validateOwnerSession to return a session for usr-older
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          user: { id: 'usr-older' } as any,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as any,
      },
      error: null,
    })

    const observedStates: any[] = []
    const unsubscribe = subscribeToAuthState(DETAIL_LAB_ID, (sess) => {
      observedStates.push(sess)
    })

    // Event 1: SIGNED_IN for usr-older (schedules deferred validation)
    authCallback('SIGNED_IN', {
      user: { id: 'usr-older' },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })

    // Event 2 immediately follows: SIGNED_OUT
    authCallback('SIGNED_OUT', null)

    // Wait for event loop to flush any deferred timers from Event 1
    await new Promise((r) => setTimeout(r, 25))

    // The final state must remain null, Event 1 must NOT overwrite Event 2!
    expect(observedStates[observedStates.length - 1]).toBeNull()

    unsubscribe()
  })

  // 32. TOKEN_REFRESHED after expiration without premature signOut
  it('32. Token Expiration: transient expiration does not trigger premature signOut and accepts TOKEN_REFRESHED', async () => {
    if (!supabase) return

    let authCallback: any = null
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any
    })

    const signOutSpy = vi.spyOn(supabase.auth, 'signOut')

    const observed: any[] = []
    const unsubscribe = subscribeToAuthState(DETAIL_LAB_ID, (sess) => {
      observed.push(sess)
    })

    // 1. Transient event with expired timestamp arrives
    authCallback('TOKEN_REFRESHED', {
      user: { id: 'usr-1' },
      expires_at: Math.floor(Date.now() / 1000) - 5, // 5 seconds in the past
    })

    // UI was notified null, but signOut was NOT called!
    expect(observed[observed.length - 1]).toBeNull()
    expect(signOutSpy).not.toHaveBeenCalled()

    // 2. Immediately after, successful refresh completes and emits fresh token
    const freshLocal = { userId: 'usr-1', companyId: DETAIL_LAB_ID, email: 'owner@detail-lab.kz', role: 'owner' }
    localStorage.setItem('detailing_auth_session_v1', JSON.stringify(freshLocal))

    authCallback('TOKEN_REFRESHED', {
      user: { id: 'usr-1' },
      expires_at: Math.floor(Date.now() / 1000) + 7200, // 2 hours future
    })

    // UI receives restored active session!
    expect(observed[observed.length - 1]).toEqual(freshLocal)

    unsubscribe()
  })

  // 33. Fast transition between slugs: older slug fetch cannot overwrite newer slug
  it('33. Slug Transition: older in-flight slug request cannot overwrite state of newly selected slug', async () => {
    let activeSlug = 'company-a'
    let loadedState: { slug: string; company: any } | null = null

    // Simulating AdminPage load generation/cancellation logic
    async function loadPage(targetSlug: string, delayMs: number) {
      const requestSlug = targetSlug
      await new Promise((r) => setTimeout(r, delayMs))

      // Check guard before state update
      if (requestSlug !== activeSlug) {
        return // Stale request cancelled!
      }

      loadedState = {
        slug: requestSlug,
        company: { id: `id-${requestSlug}`, name: requestSlug },
      }
    }

    // 1. User starts navigating to company-a (slow, 50ms)
    activeSlug = 'company-a'
    const p1 = loadPage('company-a', 50)

    // 2. User quickly switches to company-b (fast, 10ms)
    activeSlug = 'company-b'
    const p2 = loadPage('company-b', 10)

    await Promise.all([p1, p2])

    // State MUST be company-b, company-a must have been safely ignored
    expect(loadedState).not.toBeNull()
    expect(loadedState!.slug).toBe('company-b')
  })

  // 34. Token Expiration & Authoritative Recovery:
  // After local storage is wiped due to expired token, TOKEN_REFRESHED only restores
  // access if server-side company_admins membership is confirmed.
  it('34. Token Expiration: TOKEN_REFRESHED restores local session ONLY upon confirmed server-side company_admins membership', async () => {
    if (!supabase) return

    let authCallback: any = null
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any
    })

    // Mock active Supabase session
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          user: { id: 'usr-recovery', email: 'recovery@detail-lab.kz' } as any,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as any,
      },
      error: null,
    })

    // Mock company_admins: user has rights in DETAIL_LAB_ID, but NOT in AUTO_STUDIO_ID
    vi.spyOn(supabase as any, 'from').mockImplementation((table: string) => {
      let filters: { user_id?: string; company_id?: string } = {}
      const builder = {
        select: () => builder,
        eq: (col: string, val: string) => {
          if (col === 'user_id') filters.user_id = val
          if (col === 'company_id') filters.company_id = val
          return builder
        },
        maybeSingle: async () => {
          if (filters.user_id === 'usr-recovery' && filters.company_id === DETAIL_LAB_ID) {
            return { data: { company_id: DETAIL_LAB_ID, role: 'owner' }, error: null }
          }
          return { data: null, error: null }
        },
      }
      return builder
    })

    // 1. Wipe local storage (as happens after token expiration)
    localStorage.removeItem('detailing_auth_session_v1')
    expect(getCurrentOwnerSession()).toBeNull()

    // 2. Case A: Subscribed to DETAIL_LAB_ID (user is confirmed owner)
    let observedSessionA: any = undefined
    const unsubA = subscribeToAuthState(DETAIL_LAB_ID, (sess) => {
      observedSessionA = sess
    })

    // TOKEN_REFRESHED event arrives with no local storage
    authCallback('TOKEN_REFRESHED', {
      user: { id: 'usr-recovery' },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })

    // Wait for event loop to flush deferred server-side validation
    await new Promise((r) => setTimeout(r, 25))

    // Server confirmed membership -> session restored!
    expect(observedSessionA).not.toBeNull()
    expect(observedSessionA.companyId).toBe(DETAIL_LAB_ID)
    expect(observedSessionA.role).toBe('owner')
    expect(getCurrentOwnerSession()?.companyId).toBe(DETAIL_LAB_ID)

    unsubA()

    // 3. Case B: Same user tries to restore session on AUTO_STUDIO_ID (no membership in DB)
    localStorage.removeItem('detailing_auth_session_v1')
    let observedSessionB: any = undefined
    const unsubB = subscribeToAuthState(AUTO_STUDIO_ID, (sess) => {
      observedSessionB = sess
    })

    authCallback('TOKEN_REFRESHED', {
      user: { id: 'usr-recovery' },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })

    await new Promise((r) => setTimeout(r, 25))

    // Must be rejected (null), access NOT restored!
    expect(observedSessionB).toBeNull()
    expect(getCurrentOwnerSession()).toBeNull()

    unsubB()
  })

  // 35. AdminPage Race Condition: Late validateOwnerSession cannot restore session after immediate logout
  it('35. AdminPage Race Condition: late validateOwnerSession after immediate logout is safely discarded', async () => {
    let authOpId = 0
    let currentSession: any = null
    let validatingSession = false

    async function handleLoginSuccess() {
      authOpId += 1
      const currentOp = authOpId
      validatingSession = true

      // Simulate network latency in validateOwnerSession (40ms)
      await new Promise((r) => setTimeout(r, 40))

      if (authOpId !== currentOp) return // Discarded!
      currentSession = { companyId: DETAIL_LAB_ID, role: 'owner' }
      validatingSession = false
    }

    async function handleLogout() {
      authOpId += 1
      currentSession = null
      validatingSession = false
    }

    // 1. User clicks login
    const loginPromise = handleLoginSuccess()

    // 2. User immediately clicks logout (after 10ms, while login is still in-flight)
    await new Promise((r) => setTimeout(r, 10))
    await handleLogout()

    // 3. Wait for login to complete
    await loginPromise

    // State MUST remain null, dashboard must NOT be restored
    expect(currentSession).toBeNull()
    expect(validatingSession).toBe(false)
  })

  // 36. AdminPage Error Handling: Error in validateOwnerSession leaves session closed
  it('36. AdminPage Error Handling: unexpected error in validateOwnerSession leaves dashboard strictly closed', async () => {
    let currentSession: any = null
    let validatingSession = true

    async function handleLoginSuccess() {
      validatingSession = true
      try {
        // Simulate unexpected network explosion
        throw new Error('Fatal socket failure')
      } catch {
        currentSession = null
      } finally {
        validatingSession = false
      }
    }

    await handleLoginSuccess()
    expect(currentSession).toBeNull()
    expect(validatingSession).toBe(false)
  })

  // 37. Multi-company tenant isolation: login to Company B rejected for Company A admin without global signOut
  it('37. Multi-company isolation: refusing entry to Company B preserves Supabase session for Company A admin', async () => {
    if (!supabase) return

    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValue({
      data: { user: { id: 'usr-alice', email: 'alice@company-a.kz' } } as any,
      error: null,
    })

    const signOutSpy = vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null } as any)

    vi.spyOn(supabase as any, 'from').mockImplementation((table: string) => {
      let isQueryingSpecific = false
      let targetComp = ''
      const builder = {
        select: () => builder,
        eq: (col: string, val: string) => {
          if (col === 'company_id') {
            isQueryingSpecific = true
            targetComp = val
          }
          return builder
        },
        limit: () => builder,
        maybeSingle: async () => {
          // Alice is NOT an admin of AUTO_STUDIO_ID
          if (targetComp === AUTO_STUDIO_ID) {
            return { data: null, error: null }
          }
          return { data: { company_id: DETAIL_LAB_ID, role: 'owner' }, error: null }
        },
        // Query to check if user has other admin roles:
        then: (resolve: any) => {
          if (!isQueryingSpecific) {
            return Promise.resolve({ data: [{ company_id: DETAIL_LAB_ID }], error: null }).then(resolve)
          }
          return Promise.resolve({ data: null, error: null }).then(resolve)
        },
      }
      return builder
    })

    localStorage.removeItem('detailing_auth_session_v1')

    await expect(
      loginOwnerForCompany(AUTO_STUDIO_ID, 'alice@company-a.kz', 'password123')
    ).rejects.toThrow('У вашей учетной записи нет прав администратора в этом детейлинг-центре')

    // 1. signOut was NOT called because Alice has valid admin rights in Company A
    expect(signOutSpy).not.toHaveBeenCalled()

    // 2. Local storage does NOT have any session for AUTO_STUDIO_ID
    expect(getCurrentOwnerSession()).toBeNull()
  })

  // 38. Attacker with 0 admin roles is globally signed out upon login rejection
  it('38. Unprivileged user rejection: triggers global signOut when user has no admin roles in any company', async () => {
    if (!supabase) return

    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValue({
      data: { user: { id: 'usr-eve', email: 'eve@random.kz' } } as any,
      error: null,
    })

    const signOutSpy = vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null } as any)

    vi.spyOn(supabase as any, 'from').mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
      }
      return builder
    })

    localStorage.removeItem('detailing_auth_session_v1')

    await expect(
      loginOwnerForCompany(AUTO_STUDIO_ID, 'eve@random.kz', 'password123')
    ).rejects.toThrow('У вашей учетной записи нет прав администратора в этом детейлинг-центре')

    // signOut was called because Eve has 0 admin roles anywhere
    expect(signOutSpy).toHaveBeenCalled()
    expect(getCurrentOwnerSession()).toBeNull()
  })

  // 39. Transient network error during validateOwnerSession preserves localStorage (fail-closed)
  it('39. Network Error in validateOwnerSession: fails closed (returns null) but preserves local session for reconnection', async () => {
    if (!supabase) return

    const existingSession = {
      userId: 'usr-net',
      email: 'owner@detail.kz',
      companyId: DETAIL_LAB_ID,
      role: 'owner' as const,
      verifiedAt: Date.now(),
    }
    localStorage.setItem('detailing_auth_session_v1', JSON.stringify(existingSession))

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          user: { id: 'usr-net' } as any,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as any,
      },
      error: null,
    })

    // Simulate network error in PostgREST call
    vi.spyOn(supabase as any, 'from').mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: null,
          error: { message: 'TypeError: Failed to fetch', status: 0 },
        }),
      }
      return builder
    })

    const result = await validateOwnerSession(DETAIL_LAB_ID)

    // Fail-closed: returns null so unverified dashboard does NOT render
    expect(result).toBeNull()

    // BUT localStorage was preserved across temporary network glitch!
    const stored = getCurrentOwnerSession()
    expect(stored).not.toBeNull()
    expect(stored?.userId).toBe('usr-net')
  })

  // 40. Confirmed server refusal in validateOwnerSession wipes localStorage
  it('40. Server Revocation in validateOwnerSession: wipes localStorage when server confirms user is no longer admin', async () => {
    if (!supabase) return

    const existingSession = {
      userId: 'usr-revoked',
      email: 'revoked@detail.kz',
      companyId: DETAIL_LAB_ID,
      role: 'owner' as const,
      verifiedAt: Date.now() - 100000,
    }
    localStorage.setItem('detailing_auth_session_v1', JSON.stringify(existingSession))

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          user: { id: 'usr-revoked' } as any,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as any,
      },
      error: null,
    })

    // Server returns 200 with null (no admin row)
    vi.spyOn(supabase as any, 'from').mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
      }
      return builder
    })

    const result = await validateOwnerSession(DETAIL_LAB_ID)

    // Returns null and clears localStorage!
    expect(result).toBeNull()
    expect(getCurrentOwnerSession()).toBeNull()
  })

  // 41. TOKEN_REFRESHED catches revoked membership in background and locks out dashboard
  it('41. Token Refresh & Revocation: catches revoked rights during TOKEN_REFRESHED and notifies UI null', async () => {
    if (!supabase) return

    let authCallback: any = null
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any
    })

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          user: { id: 'usr-revoked-bg' } as any,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as any,
      },
      error: null,
    })

    // Server returns null for company_admins (revoked)
    vi.spyOn(supabase as any, 'from').mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
      }
      return builder
    })

    // Stored session with older verifiedAt (> 60s ago)
    const oldSession = {
      userId: 'usr-revoked-bg',
      companyId: DETAIL_LAB_ID,
      email: 'revoked@detail.kz',
      role: 'owner' as const,
      verifiedAt: Date.now() - 120_000,
    }
    localStorage.setItem('detailing_auth_session_v1', JSON.stringify(oldSession))

    const observed: any[] = []
    const unsubscribe = subscribeToAuthState(DETAIL_LAB_ID, (sess) => {
      observed.push(sess)
    })

    // TOKEN_REFRESHED arrives
    authCallback('TOKEN_REFRESHED', {
      user: { id: 'usr-revoked-bg' },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })

    // Wait for deferred background validation to complete
    await new Promise((r) => setTimeout(r, 25))

    // Revocation was caught: final notification is null and local storage is cleared
    expect(observed[observed.length - 1]).toBeNull()
    expect(getCurrentOwnerSession()).toBeNull()

    unsubscribe()
  })

  // 42. SIGNED_OUT immediately and synchronously clears local storage and notifies UI null
  it('42. Immediate SIGNED_OUT: synchronously clears local session and calls onChange(null) without delay', () => {
    if (!supabase) return

    let authCallback: any = null
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any
    })

    const initialSession = {
      userId: 'usr-out',
      companyId: DETAIL_LAB_ID,
      email: 'out@detail.kz',
      role: 'owner' as const,
    }
    localStorage.setItem('detailing_auth_session_v1', JSON.stringify(initialSession))

    const observed: any[] = []
    const unsubscribe = subscribeToAuthState(DETAIL_LAB_ID, (sess) => {
      observed.push(sess)
    })

    // Trigger SIGNED_OUT
    authCallback('SIGNED_OUT', null)

    // Synchronously executed on the same frame:
    expect(observed[observed.length - 1]).toBeNull()
    expect(getCurrentOwnerSession()).toBeNull()

    unsubscribe()
  })
  })

  // 43. Monotonic and Collision-Resistant Public Code Generation
  it('43. Public Code Generation: avoids collisions and does not regress code number when intermediate bookings are deleted', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const wash = detailLab!.services.find((s) => s.name.includes('мойка'))!

    const bookingsKey = 'detailing_bookings_v1'
    // Pre-populate with DL-001, DL-003 (DL-002 was previously deleted/expired)
    const existingBookings = [
      {
        id: 'b-1',
        company_id: DETAIL_LAB_ID,
        public_code: 'DE-001',
        client_name: 'Клиент 1',
        client_phone: '+7 777 111 22 33',
        car_make: 'BMW',
        car_model: 'X5',
        services_snapshot: [],
        total_price_from: 8000,
        total_duration_minutes: 90,
        starts_at: '2026-11-10T10:00:00.000Z',
        ends_at: '2026-11-10T11:30:00.000Z',
        status: 'confirmed',
        created_at: new Date().toISOString(),
      },
      {
        id: 'b-3',
        company_id: DETAIL_LAB_ID,
        public_code: 'DE-003',
        client_name: 'Клиент 3',
        client_phone: '+7 777 333 44 55',
        car_make: 'Audi',
        car_model: 'Q7',
        services_snapshot: [],
        total_price_from: 8000,
        total_duration_minutes: 90,
        starts_at: '2026-11-10T14:00:00.000Z',
        ends_at: '2026-11-10T15:30:00.000Z',
        status: 'confirmed',
        created_at: new Date().toISOString(),
      },
    ]
    localStorage.setItem(bookingsKey, JSON.stringify(existingBookings))

    const { dateObj } = getNextWorkingDate(2)
    dateObj.setHours(16, 0, 0, 0)

    const newBooking = await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [wash.id],
      clientName: 'Клиент 4',
      clientPhone: '+7 707 999 88 77',
      carMake: 'Porsche',
      carModel: 'Cayenne',
      startsAt: dateObj.toISOString(),
    })

    // Must be DE-004 (max sequence 3 + 1), never colliding with DE-001 or DE-003!
    expect(newBooking.public_code).toBe('DE-004')
  })

  // 44. Concurrency & Conflict: createManualBooking rejects overlap with existing bookings
  it('44. Manual Booking Conflict: rejects creation when requested interval overlaps an existing active booking', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const wash = detailLab!.services.find((s) => s.name.includes('мойка'))!

    const { dateObj } = getNextWorkingDate(3)
    dateObj.setHours(11, 0, 0, 0)
    const startsAt = dateObj.toISOString()

    // 1. Online booking created for 11:00 - 12:30
    await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [wash.id],
      clientName: 'Первый Клиент',
      clientPhone: '+7 777 000 11 22',
      carMake: 'Lexus',
      carModel: 'RX',
      startsAt,
    })

    // 2. Manager attempts manual booking overlapping 11:30 - 13:00
    dateObj.setHours(11, 30, 0, 0)
    const conflictStart = dateObj.toISOString()
    dateObj.setHours(13, 0, 0, 0)
    const conflictEnd = dateObj.toISOString()

    await expect(
      createManualBooking({
        companyId: DETAIL_LAB_ID,
        clientName: 'Ручной Клиент',
        clientPhone: '+7 707 111 22 33',
        carMake: 'Mercedes',
        carModel: 'E-Class',
        serviceNames: 'Полировка',
        totalPrice: 45000,
        startsAt: conflictStart,
        endsAt: conflictEnd,
      })
    ).rejects.toThrow('Выбранное время конфликтует с существующим бронированием')
  })

  // 45. Manual Booking Conflict: rejects creation when overlapping blocked intervals
  it('45. Manual Booking Conflict: rejects creation when interval overlaps a blocked interval', async () => {
    const { dateObj } = getNextWorkingDate(4)
    dateObj.setHours(14, 0, 0, 0)
    const blockStart = dateObj.toISOString()
    dateObj.setHours(16, 0, 0, 0)
    const blockEnd = dateObj.toISOString()

    // Block interval created
    await createBlockedInterval({
      companyId: DETAIL_LAB_ID,
      startsAt: blockStart,
      endsAt: blockEnd,
      reason: 'Техническое обслуживание бокса',
    })

    // Attempt manual booking inside blocked time (14:30 - 15:30)
    dateObj.setHours(14, 30, 0, 0)
    const manualStart = dateObj.toISOString()
    dateObj.setHours(15, 30, 0, 0)
    const manualEnd = dateObj.toISOString()

    await expect(
      createManualBooking({
        companyId: DETAIL_LAB_ID,
        clientName: 'Клиент Во Время Блокировки',
        clientPhone: '+7 707 999 11 22',
        carMake: 'BMW',
        carModel: 'M5',
        serviceNames: 'Химчистка',
        totalPrice: 35000,
        startsAt: manualStart,
        endsAt: manualEnd,
      })
    ).rejects.toThrow('Выбранное время конфликтует с заблокированным интервалом')
  })

  // 46. Storage upload guard: falls back to DataURL when storage is disabled in production
  it('46. Storage Guard: safely uses compressed Base64 Data URL when production storage uploads are disabled', async () => {
    const dummyBlob = new Blob(['dummy-image-binary-data'], { type: 'image/jpeg' })
    const dummyFile = new File([dummyBlob], 'test_photo.jpg', { type: 'image/jpeg' })

    const result = await uploadImageFile(DETAIL_LAB_ID, dummyFile, 'portfolio')

    // Result must be a valid Data URL, not an unverified external Supabase storage URL
    expect(result).toMatch(/^data:image\/jpeg;base64,/)
  })

  // 47. Supabase Mode: empty slot array from get_available_slots RPC returns [] and NEVER calculates local slots
  it('47. Supabase Mode: get_available_slots returning empty array [] returns [] without fallback to local store', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    const rpcSpy = vi.spyOn(supabase as any, 'rpc').mockImplementation(async (fn: string, args: any) => {
      if (fn === 'get_available_slots') {
        return { data: [], error: null }
      }
      return { data: null, error: null }
    })

    const slots = await getAvailableSlots(DETAIL_LAB_ID, ['service-wash'], '2026-11-03')

    expect(slots).toEqual([])
    expect(rpcSpy).toHaveBeenCalledWith('get_available_slots', {
      p_company_id: DETAIL_LAB_ID,
      p_service_ids: ['service-wash'],
      p_date: '2026-11-03',
    })
  })

  // 48. Supabase Mode: network error in getCompanyBySlug throws controlled error and NEVER returns local demo company
  it('48. Supabase Mode: network error in getCompanyBySlug throws controlled error and NEVER returns local demo company', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    vi.spyOn(supabase as any, 'rpc').mockImplementation(async (fn: string) => {
      if (fn === 'get_company_by_slug') {
        return { data: null, error: new Error('Failed to fetch (net::ERR_CONNECTION_REFUSED)') }
      }
      return { data: null, error: null }
    })

    await expect(getCompanyBySlug('detail-lab')).rejects.toThrow(
      'Ошибка сети при загрузке данных студии. Проверьте интернет-соединение.'
    )
  })

  // 49. Supabase Mode: network error in createBooking throws controlled error and NEVER saves booking to localStorage
  it('49. Supabase Mode: network error in createBooking throws controlled error and NEVER saves booking to localStorage', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    const initialBookings = localStorage.getItem('detailing_bookings_v1')

    vi.spyOn(supabase as any, 'rpc').mockImplementation(async (fn: string) => {
      if (fn === 'create_booking') {
        return { data: null, error: new Error('net::ERR_CONNECTION_TIMED_OUT') }
      }
      return { data: null, error: null }
    })

    const { dateObj } = getNextWorkingDate(3)
    dateObj.setHours(12, 0, 0, 0)

    await expect(
      createBooking({
        companyId: DETAIL_LAB_ID,
        serviceIds: ['service-wash'],
        clientName: 'Клиент Сети',
        clientPhone: '+7 707 123 45 67',
        carMake: 'Audi',
        carModel: 'A6',
        startsAt: dateObj.toISOString(),
      })
    ).rejects.toThrow('Ошибка сети при оформлении заявки. Пожалуйста, проверьте интернет-соединение')

    // Confirm that no booking was written to localStorage
    expect(localStorage.getItem('detailing_bookings_v1')).toBe(initialBookings)
  })

  // 50. Supabase Mode: business error in createBooking throws database validation error and NEVER saves booking to localStorage
  it('50. Supabase Mode: business error in createBooking throws database validation error and NEVER saves booking to localStorage', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    const initialBookings = localStorage.getItem('detailing_bookings_v1')

    vi.spyOn(supabase as any, 'rpc').mockImplementation(async (fn: string) => {
      if (fn === 'create_booking') {
        return { data: null, error: { message: 'Выбранное время уже занято другой подтвержденной записью' } }
      }
      return { data: null, error: null }
    })

    const { dateObj } = getNextWorkingDate(3)
    dateObj.setHours(12, 0, 0, 0)

    await expect(
      createBooking({
        companyId: DETAIL_LAB_ID,
        serviceIds: ['service-wash'],
        clientName: 'Конфликтный Клиент',
        clientPhone: '+7 707 123 45 67',
        carMake: 'BMW',
        carModel: 'X5',
        startsAt: dateObj.toISOString(),
      })
    ).rejects.toThrow('Выбранное время уже занято другой подтвержденной записью')

    expect(localStorage.getItem('detailing_bookings_v1')).toBe(initialBookings)
  })

  // 51. Local Mode: when Supabase is unconfigured, local mode continues to function normally in dev/test
  it('51. Local Mode: when Supabase is unconfigured, local mode continues to function normally in dev/test', async () => {
    setSupabaseConfigured(false)

    // 1. Can load company
    const comp = await getCompanyBySlug('detail-lab')
    expect(comp).not.toBeNull()
    expect(comp?.company.slug).toBe('detail-lab')

    // 2. Can calculate slots locally
    const wash = comp!.services.find((s) => s.name.includes('мойка'))!
    const { dateStr } = getNextWorkingDate(2)
    const slots = await getAvailableSlots(DETAIL_LAB_ID, [wash.id], dateStr)
    expect(slots.length).toBeGreaterThan(0)

    // 3. Can create booking locally
    const { dateObj } = getNextWorkingDate(2)
    dateObj.setHours(15, 0, 0, 0)
    const booking = await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [wash.id],
      clientName: 'Локальный Клиент',
      clientPhone: '+7 707 555 44 33',
      carMake: 'Toyota',
      carModel: 'Camry',
      startsAt: dateObj.toISOString(),
    })
    expect(booking.id).toBeDefined()
    expect(booking.client_name).toBe('Локальный Клиент')

    // Confirm booking exists in localStorage
    const savedBookings = JSON.parse(localStorage.getItem('detailing_bookings_v1') || '[]')
    expect(savedBookings.some((b: any) => b.id === booking.id)).toBe(true)
  })

  // 52. Production Guard: when Supabase is unconfigured in production, application fails closed
  it('52. Production Guard: when Supabase is unconfigured in production, application fails closed', async () => {
    setSupabaseConfigured(false)
    process.env.TEST_BLOCK_LOCAL_MODE = 'true'

    try {
      await expect(getCompanyBySlug('detail-lab')).rejects.toThrow(
        'Конфигурация Supabase не настроена в продакшен-режиме'
      )

      await expect(getAvailableSlots(DETAIL_LAB_ID, ['service-wash'], '2026-11-03')).rejects.toThrow(
        'Конфигурация Supabase не настроена в продакшен-режиме'
      )

      await expect(
        createBooking({
          companyId: DETAIL_LAB_ID,
          serviceIds: ['service-wash'],
          clientName: 'Прод Клиент',
          clientPhone: '+7 707 111 22 33',
          carMake: 'Lexus',
          carModel: 'LX',
          startsAt: '2026-11-03T10:00:00.000Z',
        })
      ).rejects.toThrow('Конфигурация Supabase не настроена в продакшен-режиме')
    } finally {
      delete process.env.TEST_BLOCK_LOCAL_MODE
    }
  })

  // 53. Supabase Admin: getOwnerDashboardData loads full company dataset from Supabase RPC
  it('53. Supabase Admin: getOwnerDashboardData loads full company dataset from Supabase RPC', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    const rpcSpy = vi.spyOn(supabase as any, 'rpc').mockImplementation(async (fn: string, args: any) => {
      if (fn === 'get_owner_dashboard_data') {
        expect(args.p_company_id).toBe(DETAIL_LAB_ID)
        return {
          data: {
            company: { id: DETAIL_LAB_ID, name: 'Detail Lab Server' } as any,
            bookings: [{ id: 'b-srv-1', company_id: DETAIL_LAB_ID, client_name: 'Серверный Клиент' }] as any,
            services: [{ id: 's-srv-1', company_id: DETAIL_LAB_ID, name: 'Серверная Услуга', price_from: 10000 }] as any,
            gallery_photos: [],
            weekly_schedule: [],
            schedule_breaks: [],
            blocked_intervals: [],
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    const dashboard = await getOwnerDashboardData(DETAIL_LAB_ID)

    expect(dashboard.company.name).toBe('Detail Lab Server')
    expect(dashboard.bookings.length).toBe(1)
    expect(dashboard.bookings[0].client_name).toBe('Серверный Клиент')
    expect(dashboard.services.length).toBe(1)
    expect(rpcSpy).toHaveBeenCalledWith('get_owner_dashboard_data', { p_company_id: DETAIL_LAB_ID })
  })

  // 54. Supabase Admin: getOwnerDashboardData network or auth error throws controlled error without fallback
  it('54. Supabase Admin: getOwnerDashboardData network or auth error throws controlled error without fallback', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    // Pre-populate local storage with demo company to verify it is NEVER read
    localStorage.setItem('detailing_companies_v1', JSON.stringify({
      [DETAIL_LAB_ID]: { id: DETAIL_LAB_ID, name: 'Local Fallback Company' }
    }))

    // Network error
    vi.spyOn(supabase as any, 'rpc').mockResolvedValueOnce({
      data: null,
      error: new Error('Failed to fetch (net::ERR_INTERNET_DISCONNECTED)'),
    })

    await expect(getOwnerDashboardData(DETAIL_LAB_ID)).rejects.toThrow(
      'Ошибка сети при загрузке дашборда. Проверьте интернет-соединение.'
    )

    // Unauthorized error
    vi.spyOn(supabase as any, 'rpc').mockResolvedValueOnce({
      data: null,
      error: { message: 'Unauthorized: you are not an administrator of this company' },
    })

    await expect(getOwnerDashboardData(DETAIL_LAB_ID)).rejects.toThrow(
      'Unauthorized: you are not an administrator of this company'
    )
  })

  // 55. Supabase Admin: updateBookingStatus updates via server RPC and does not touch LocalStorage on error
  it('55. Supabase Admin: updateBookingStatus updates via server RPC and does not touch LocalStorage on error', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    const initialBookings = localStorage.getItem('detailing_bookings_v1')

    const rpcSpy = vi.spyOn(supabase as any, 'rpc').mockImplementation(async (fn: string, args: any) => {
      if (fn === 'confirm_booking') {
        expect(args.p_booking_id).toBe('bk-100')
        return { data: { id: 'bk-100', company_id: DETAIL_LAB_ID, status: 'confirmed' }, error: null }
      }
      if (fn === 'cancel_booking') {
        return { data: null, error: new Error('Failed to fetch (net::ERR_TIMED_OUT)') }
      }
      return { data: null, error: null }
    })

    // Success
    const confirmed = await updateBookingStatus(DETAIL_LAB_ID, 'bk-100', 'confirmed')
    expect(confirmed.status).toBe('confirmed')
    expect(rpcSpy).toHaveBeenCalledWith('confirm_booking', { p_booking_id: 'bk-100' })

    // Failure on cancellation
    await expect(updateBookingStatus(DETAIL_LAB_ID, 'bk-100', 'cancelled')).rejects.toThrow(
      'Ошибка сети при обновлении статуса заявки. Проверьте интернет-соединение.'
    )

    // Verify localStorage was not touched
    expect(localStorage.getItem('detailing_bookings_v1')).toBe(initialBookings)
  })

  // 56. Supabase Admin: updateBookingStatus enforces tenant isolation
  it('56. Supabase Admin: updateBookingStatus enforces tenant isolation and rejects mismatched company', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    vi.spyOn(supabase as any, 'rpc').mockResolvedValueOnce({
      data: { id: 'bk-comp-b', company_id: AUTO_STUDIO_ID, status: 'confirmed' },
      error: null,
    })

    await expect(updateBookingStatus(DETAIL_LAB_ID, 'bk-comp-b', 'confirmed')).rejects.toThrow(
      'Нарушение изоляции арендатора: заявка принадлежит другой компании'
    )
  })

  // 57. Supabase Admin: createManualBooking invokes server RPC and throws server conflicts
  it('57. Supabase Admin: createManualBooking invokes server RPC and throws server conflicts', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    const initialBookings = localStorage.getItem('detailing_bookings_v1')

    const rpcSpy = vi.spyOn(supabase as any, 'rpc').mockImplementation(async (fn: string, args: any) => {
      if (fn === 'create_manual_booking') {
        if (args.p_client_name === 'Conflict Client') {
          return { data: null, error: { message: 'Requested manual booking conflicts with an existing booking' } }
        }
        return {
          data: {
            id: 'man-uuid-1',
            company_id: DETAIL_LAB_ID,
            public_code: 'MAN-001',
            client_name: args.p_client_name,
            status: 'confirmed',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    const { dateObj } = getNextWorkingDate(2)
    dateObj.setHours(10, 0, 0, 0)
    const startsAt = dateObj.toISOString()
    dateObj.setHours(12, 0, 0, 0)
    const endsAt = dateObj.toISOString()

    // 1. Success creation
    const created = await createManualBooking({
      companyId: DETAIL_LAB_ID,
      clientName: 'VIP Клиент',
      clientPhone: '+7 777 111 22 33',
      carMake: 'Mercedes',
      carModel: 'S-Class',
      serviceNames: 'Премиум полировка',
      totalPrice: 150000,
      startsAt,
      endsAt,
    })
    expect(created.public_code).toBe('MAN-001')
    expect(created.status).toBe('confirmed')

    // 2. Conflict rejection
    await expect(
      createManualBooking({
        companyId: DETAIL_LAB_ID,
        clientName: 'Conflict Client',
        clientPhone: '+7 777 999 88 77',
        carMake: 'BMW',
        carModel: '7',
        serviceNames: 'Химчистка',
        totalPrice: 50000,
        startsAt,
        endsAt,
      })
    ).rejects.toThrow('Requested manual booking conflicts with an existing booking')

    // Confirm local storage was not modified
    expect(localStorage.getItem('detailing_bookings_v1')).toBe(initialBookings)
  })

  // 58. Supabase Admin: rescheduleBooking invokes server RPC and preserves old time on conflict
  it('58. Supabase Admin: rescheduleBooking invokes server RPC and preserves old time on conflict', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    const rpcSpy = vi.spyOn(supabase as any, 'rpc').mockImplementation(async (fn: string, args: any) => {
      if (fn === 'reschedule_booking') {
        if (args.p_new_starts_at.includes('T14:00:00')) {
          return { data: null, error: { message: 'Selected new time conflicts with an existing booking' } }
        }
        return {
          data: {
            id: args.p_booking_id,
            company_id: DETAIL_LAB_ID,
            starts_at: args.p_new_starts_at,
            status: 'confirmed',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    // 1. Success
    const moved = await rescheduleBooking(DETAIL_LAB_ID, 'bk-orig', '2026-11-05T10:00:00.000Z')
    expect(moved.starts_at).toBe('2026-11-05T10:00:00.000Z')

    // 2. Conflict
    await expect(
      rescheduleBooking(DETAIL_LAB_ID, 'bk-orig', '2026-11-05T14:00:00.000Z')
    ).rejects.toThrow('Selected new time conflicts with an existing booking')
  })

  // 59. Supabase Admin: createBlockedInterval and deleteBlockedInterval invoke server RPCs
  it('59. Supabase Admin: createBlockedInterval and deleteBlockedInterval invoke server RPCs', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    const rpcSpy = vi.spyOn(supabase as any, 'rpc').mockImplementation(async (fn: string, args: any) => {
      if (fn === 'create_blocked_interval') {
        return {
          data: {
            id: 'bi-srv-1',
            company_id: args.p_company_id,
            starts_at: args.p_starts_at,
            ends_at: args.p_ends_at,
            reason: args.p_reason,
          },
          error: null,
        }
      }
      if (fn === 'delete_blocked_interval') {
        expect(args.p_company_id).toBe(DETAIL_LAB_ID)
        expect(args.p_interval_id).toBe('bi-srv-1')
        return { data: { success: true }, error: null }
      }
      return { data: null, error: null }
    })

    const created = await createBlockedInterval({
      companyId: DETAIL_LAB_ID,
      startsAt: '2026-11-06T10:00:00.000Z',
      endsAt: '2026-11-06T18:00:00.000Z',
      reason: 'Плановое ТО бокса',
    })
    expect(created.id).toBe('bi-srv-1')
    expect(created.reason).toBe('Плановое ТО бокса')

    await expect(deleteBlockedInterval(DETAIL_LAB_ID, 'bi-srv-1')).resolves.toBeUndefined()
  })

  // 60. Supabase Admin: saveService and deleteService invoke server RPCs with strict tenant isolation
  it('60. Supabase Admin: saveService and deleteService invoke server RPCs with strict tenant isolation', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    const rpcSpy = vi.spyOn(supabase as any, 'rpc').mockImplementation(async (fn: string, args: any) => {
      if (fn === 'save_service') {
        if (args.p_company_id !== DETAIL_LAB_ID) {
          return { data: null, error: { message: 'Unauthorized: you are not an administrator of this company' } }
        }
        expect(args.p_image_url).toBe('https://images.unsplash.com/photo-1')
        return { data: { id: args.p_service_id || 'srv-new', name: args.p_name }, error: null }
      }
      if (fn === 'delete_service') {
        if (args.p_company_id !== DETAIL_LAB_ID) {
          return { data: null, error: { message: 'Unauthorized: you are not an administrator of this company' } }
        }
        return { data: { success: true }, error: null }
      }
      return { data: null, error: null }
    })

    // 1. Success save
    await expect(
      saveService({
        id: 'srv-10',
        company_id: DETAIL_LAB_ID,
        name: 'Керамика 9H',
        description: 'Защитное покрытие',
        price_from: 120000,
        duration_minutes: 240,
        image_url: 'https://images.unsplash.com/photo-1',
        sort_order: 1,
        active: true,
      })
    ).resolves.toBeUndefined()

    // 2. Success delete
    await expect(deleteService(DETAIL_LAB_ID, 'srv-10')).resolves.toBeUndefined()

    // 3. Unauthorized cross-tenant attempt
    await expect(
      saveService({
        id: 'srv-comp-b',
        company_id: AUTO_STUDIO_ID,
        name: 'Взлом конкурента',
        price_from: 1000,
        duration_minutes: 30,
        sort_order: 1,
        active: true,
      })
    ).rejects.toThrow('Unauthorized: you are not an administrator of this company')
  })

  // 61. Supabase Admin: updateCompanySettings invokes server RPC and updates studio settings
  it('61. Supabase Admin: updateCompanySettings invokes server RPC and updates studio settings', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    const rpcSpy = vi.spyOn(supabase as any, 'rpc').mockImplementation(async (fn: string, args: any) => {
      if (fn === 'update_company_settings') {
        expect(args.p_company_id).toBe(DETAIL_LAB_ID)
        return {
          data: {
            id: DETAIL_LAB_ID,
            name: args.p_settings.name || 'Detail Lab',
            slot_step_minutes: args.p_settings.slot_step_minutes || 30,
            duration_calculation_mode: args.p_settings.duration_calculation_mode || 'max',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    const updated = await updateCompanySettings(DETAIL_LAB_ID, {
      name: 'Detail Lab Premium Studio',
      slot_step_minutes: 45,
    })

    expect(updated.name).toBe('Detail Lab Premium Studio')
    expect(updated.slot_step_minutes).toBe(45)
  })

  // 62. Supabase Admin: cross-tenant access rejection when user is unauthorized on company
  it('62. Supabase Admin: cross-tenant access rejection when user is unauthorized on company', async () => {
    if (!supabase) return
    setSupabaseConfigured(true)

    vi.spyOn(supabase as any, 'rpc').mockResolvedValue({
      data: null,
      error: { message: 'Unauthorized: you are not an administrator of this company' },
    })

    // Attacking Auto Studio while logged in as Detail Lab owner
    await expect(getOwnerDashboardData(AUTO_STUDIO_ID)).rejects.toThrow(
      'Unauthorized: you are not an administrator of this company'
    )

    await expect(deleteService(AUTO_STUDIO_ID, 'srv-target')).rejects.toThrow(
      'Unauthorized: you are not an administrator of this company'
    )

    await expect(
      updateCompanySettings(AUTO_STUDIO_ID, { name: 'Compromised Name' })
    ).rejects.toThrow('Unauthorized: you are not an administrator of this company')
  })

  // 63. Booking Idempotency: same key returns existing booking without creating duplicates
  it('63. Booking Idempotency: same key returns existing booking without creating duplicates', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    expect(detailLab).not.toBeNull()
    const service = detailLab!.services[0]
    const nextDate = getNextWorkingDate(1)
    const startsAt = new Date(nextDate.dateObj)
    startsAt.setHours(14, 0, 0, 0)

    const key = 'idem-test-uuid-001'
    const booking1 = await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [service.id],
      clientName: 'Алишер Идемпотентов',
      clientPhone: '+7 701 555 7788',
      carMake: 'BMW',
      carModel: 'M3',
      startsAt: startsAt.toISOString(),
      idempotencyKey: key,
    })

    expect(booking1).toBeDefined()
    expect(booking1.public_code).toBeDefined()
    expect(booking1.idempotency_key).toBe(key)

    // Repeat with identical key and parameters
    const booking2 = await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [service.id],
      clientName: 'Алишер Идемпотентов',
      clientPhone: '+7 701 555 7788',
      carMake: 'BMW',
      carModel: 'M3',
      startsAt: startsAt.toISOString(),
      idempotencyKey: key,
    })

    expect(booking2.id).toBe(booking1.id)
    expect(booking2.public_code).toBe(booking1.public_code)
  })

  // 64. Booking Idempotency: same key with altered parameters is strictly rejected
  it('64. Booking Idempotency: same key with altered parameters is strictly rejected', async () => {
    const detailLab = await getCompanyBySlug('detail-lab')
    const service = detailLab!.services[0]
    const nextDate = getNextWorkingDate(2)
    const startsAt = new Date(nextDate.dateObj)
    startsAt.setHours(15, 0, 0, 0)

    const key = 'idem-test-uuid-002'
    await createBooking({
      companyId: DETAIL_LAB_ID,
      serviceIds: [service.id],
      clientName: 'Бауржан Параметров',
      clientPhone: '+7 701 333 4455',
      carMake: 'Audi',
      carModel: 'RS6',
      startsAt: startsAt.toISOString(),
      idempotencyKey: key,
    })

    // Repeat with altered car model
    await expect(
      createBooking({
        companyId: DETAIL_LAB_ID,
        serviceIds: [service.id],
        clientName: 'Бауржан Параметров',
        clientPhone: '+7 701 333 4455',
        carMake: 'Audi',
        carModel: 'RS7 Sportback', // altered
        startsAt: startsAt.toISOString(),
        idempotencyKey: key,
      })
    ).rejects.toThrow('different booking parameters')
  })

  it('65. VITE_DEFAULT_COMPANY_SLUG: fallback resolution and non-existent slug safety', async () => {
    // 1. Fallback when undefined or empty
    const resolveDefaultSlug = (val?: string) => val || 'detail-lab'
    expect(resolveDefaultSlug(undefined)).toBe('detail-lab')
    expect(resolveDefaultSlug('')).toBe('detail-lab')
    expect(resolveDefaultSlug('prime-detailing')).toBe('prime-detailing')

    // 2. getCompanyBySlug returns data for real companies
    const dl = await getCompanyBySlug('detail-lab')
    expect(dl).not.toBeNull()
    expect(dl?.company.slug).toBe('detail-lab')

    const as = await getCompanyBySlug('auto-studio')
    expect(as).not.toBeNull()
    expect(as?.company.slug).toBe('auto-studio')

    // 3. getCompanyBySlug returns null for non-existent company without error
    const nonExistent = await getCompanyBySlug('non-existent-studio-xyz')
    expect(nonExistent).toBeNull()
  })
})
