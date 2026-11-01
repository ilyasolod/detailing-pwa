import { describe, it, expect, beforeEach } from 'vitest'
import {
  initializeDetailingStore,
  getCompanyBySlug,
  getAvailableSlots,
  createBooking,
  updateBookingStatus,
  rescheduleBooking,
  createBlockedInterval,
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
} from '../src/lib/detailing-engine'
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
})
