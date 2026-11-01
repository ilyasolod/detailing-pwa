import React, { useState, useEffect } from 'react'
import type { Company, Service, AvailableSlot, Booking } from '../../types/database'
import {
  CalendarBlank,
  Clock,
  User,
  Phone,
  Car,
  WarningCircle,
  SpinnerGap,
  WhatsappLogo,
  ArrowCounterClockwise,
} from '@phosphor-icons/react'
import {
  getAvailableSlots,
  createBooking,
  formatDurationHuman,
  buildWhatsAppLink,
} from '../../lib/detailing-engine'

interface BookingFormBlockProps {
  company: Company
  services: Service[]
  selectedServiceIds: string[]
  onBookingCreated: (booking: Booking) => void
  brandColor?: string
}

// Generate the next 14 calendar dates
function getUpcomingDays(count = 14): Array<{ dateStr: string; label: string; weekdayName: string }> {
  const days: Array<{ dateStr: string; label: string; weekdayName: string }> = []
  const now = new Date()

  const weekdayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  const monthNames = [
    'янв', 'фев', 'мар', 'апр', 'май', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
  ]

  for (let i = 0; i < count; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)

    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    let label = `${d.getDate()} ${monthNames[d.getMonth()]}`
    if (i === 0) label = `Сегодня, ${d.getDate()} ${monthNames[d.getMonth()]}`
    if (i === 1) label = `Завтра, ${d.getDate()} ${monthNames[d.getMonth()]}`

    days.push({
      dateStr,
      label,
      weekdayName: weekdayNames[d.getDay()] ?? 'Пн',
    })
  }

  return days
}

export const BookingFormBlock: React.FC<BookingFormBlockProps> = ({
  company,
  services,
  selectedServiceIds,
  onBookingCreated,
  brandColor = '#E5A93C',
}) => {
  const upcomingDays = getUpcomingDays(14)
  const [selectedDate, setSelectedDate] = useState<string>(upcomingDays[0]?.dateStr ?? '')
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null)
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [slotsRetryCount, setSlotsRetryCount] = useState<number>(0)

  // Customer vehicle & contact inputs
  const [clientName, setClientName] = useState<string>('')
  const [clientPhone, setClientPhone] = useState<string>('+7 ')
  const [carMake, setCarMake] = useState<string>('')
  const [carModel, setCarModel] = useState<string>('')

  // State
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'bkey-' + Math.random().toString(36).slice(2)
  )

  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id))
  const isSumMode = company.duration_calculation_mode === 'sum'
  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price_from, 0)
  const totalDuration = isSumMode
    ? selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0)
    : (selectedServices.length ? Math.max(...selectedServices.map((s) => s.duration_minutes)) : 0)

  // Validation flags for the final WhatsApp booking transfer
  const hasServices = selectedServices.length > 0
  const hasSlot = selectedSlot !== null
  const hasName = clientName.trim().length > 0
  const hasPhone = clientPhone.replace(/\D/g, '').length >= 11
  const hasCar = carMake.trim().length > 0 && carModel.trim().length > 0
  const isFormComplete = hasServices && hasSlot && hasName && hasPhone && hasCar

  // Fetch free slots when selected services or date changes
  useEffect(() => {
    let isCurrent = true
    if (!selectedServiceIds.length) {
      setSlots([])
      setSelectedSlot(null)
      setSlotsError(null)
      return
    }

    setLoadingSlots(true)
    setSelectedSlot(null)
    setSlotsError(null)

    getAvailableSlots(company.id, selectedServiceIds, selectedDate)
      .then((data) => {
        if (isCurrent) {
          setSlots(data)
          setSlotsError(null)
          if (data.length > 0 && data[0]) {
            setSelectedSlot(data[0])
          }
        }
      })
      .catch((err) => {
        if (isCurrent) {
          setSlots([])
          setSelectedSlot(null)
          setSlotsError(
            err instanceof Error
              ? err.message
              : 'Не удалось загрузить доступные интервалы с сервера.'
          )
        }
      })
      .finally(() => {
        if (isCurrent) setLoadingSlots(false)
      })

    return () => {
      isCurrent = false
    }
  }, [company.id, selectedServiceIds, selectedDate, slotsRetryCount])

  const handleRetrySlots = () => {
    setSlotsRetryCount((c) => c + 1)
  }

  const handleSelectSlot = (slot: AvailableSlot) => {
    setSelectedSlot(slot)
    setIdempotencyKey(
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'bkey-' + Math.random().toString(36).slice(2)
    )
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    if (!val.startsWith('+7')) val = '+7 '
    setClientPhone(val)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setFormError(null)

    if (!selectedServiceIds.length) {
      setFormError('Пожалуйста, выберите хотя бы одну услугу в каталоге выше')
      document.getElementById('services-section')?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    if (!selectedSlot) {
      setFormError('Пожалуйста, выберите свободное время в календаре (шаг 2)')
      return
    }

    if (!clientName.trim()) {
      setFormError('Пожалуйста, укажите ваше имя')
      return
    }

    const cleanDigits = clientPhone.replace(/\D/g, '')
    if (cleanDigits.length < 11) {
      setFormError('Пожалуйста, укажите корректный номер телефона (например, +7 707 123 45 67)')
      return
    }

    if (!carMake.trim() || !carModel.trim()) {
      setFormError('Пожалуйста, укажите марку и модель автомобиля')
      return
    }

    setSubmitting(true)
    try {
      const booking = await createBooking({
        companyId: company.id,
        serviceIds: selectedServiceIds,
        clientName,
        clientPhone,
        carMake,
        carModel,
        startsAt: selectedSlot.starts_at,
        idempotencyKey,
      })

      // Generate a fresh idempotency key for any future booking attempts
      setIdempotencyKey(
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'bkey-' + Math.random().toString(36).slice(2)
      )

      // 1. Show confirmation modal in the app (must remain visible)
      onBookingCreated(booking)

      // 2. Build WhatsApp link with complete reservation details
      const waUrl = buildWhatsAppLink(company, booking)

      // 3. Open WhatsApp: on Desktop open in new tab so modal stays open; on mobile trigger app link
      const isMobile =
        typeof navigator !== 'undefined' &&
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

      if (isMobile) {
        window.location.href = waUrl
      } else {
        try {
          window.open(waUrl, '_blank', 'noopener,noreferrer')
        } catch {
          // Popup blocked by browser: modal is already open with explicit "Перейти в WhatsApp" button
        }
      }
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : ''
      if (rawMessage.includes('different booking parameters')) {
        setFormError('Данные заявки были изменены после отправки. Пожалуйста, обновите страницу или повторите выбор времени.')
      } else {
        setFormError(
          rawMessage || 'Не удалось создать заявку. Попробуйте выбрать другой интервал времени.'
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section id="booking-section" className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="border-b border-white/10 pb-4">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Шаг 2 из 2
        </span>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Оформление онлайн-записи
        </h2>
        <p className="mt-1 text-xs text-zinc-400">
          Заполните данные вашего автомобиля и выберите удобное время
        </p>
      </div>

      {selectedServices.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-white/20 p-8 text-center bg-zinc-900/30">
          <CalendarBlank size={40} className="mx-auto text-zinc-500 mb-3" />
          <h3 className="text-base font-bold text-white">Услуги не выбраны</h3>
          <p className="mt-1 text-xs text-zinc-400 max-w-md mx-auto">
            Для расчёта доступного времени и длительности работы, пожалуйста, отметьте нужные услуги в каталоге выше.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-8">
          {/* Summary Banner */}
          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <span className="text-xs text-zinc-400">Выбранные услуги ({selectedServices.length}):</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {selectedServices.map((s) => (
                    <span
                      key={s.id}
                      className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-200"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-zinc-400">Длительность:</span>
                <div className="text-sm font-bold text-zinc-200">
                  ~{formatDurationHuman(totalDuration)}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-zinc-400">Предварительная сумма:</span>
              <span className="text-xl font-black" style={{ color: brandColor }}>
                от {totalPrice.toLocaleString('ru-RU')} ₸
              </span>
            </div>
          </div>

          {/* 1. Date Selector */}
          <div>
            <label className="block text-sm font-bold text-zinc-200 mb-3">
              1. Выберите дату посещения:
            </label>
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
              {upcomingDays.map((day) => {
                const isSelected = selectedDate === day.dateStr
                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(day.dateStr)}
                    className={`flex flex-col items-center justify-center min-w-[90px] rounded-xl border p-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-transparent text-black font-bold shadow-md scale-[1.02]'
                        : 'border-white/10 bg-zinc-900/80 text-zinc-300 hover:border-white/25 hover:bg-zinc-800'
                    }`}
                    style={{
                      backgroundColor: isSelected ? brandColor : undefined,
                    }}
                  >
                    <span className="text-[11px] uppercase opacity-80">
                      {day.weekdayName}
                    </span>
                    <span className="mt-1 text-sm font-extrabold whitespace-nowrap">
                      {day.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Free Slots */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-zinc-200">
                2. Доступное время начала (учитывая {formatDurationHuman(totalDuration)} работы):
              </label>
              {loadingSlots && (
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <SpinnerGap size={14} className="animate-spin" />
                  Расчёт интервалов...
                </span>
              )}
            </div>

            {loadingSlots ? (
              <div className="h-24 flex items-center justify-center rounded-xl border border-white/10 bg-zinc-900/40">
                <SpinnerGap size={24} className="animate-spin text-zinc-400" />
              </div>
            ) : slotsError ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
                <WarningCircle size={28} className="mx-auto text-amber-400 mb-2" />
                <p className="text-sm font-semibold text-zinc-200">
                  {slotsError}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Не удалось загрузить доступные интервалы с сервера. Попробуйте обновить запрос.
                </p>
                <button
                  type="button"
                  onClick={handleRetrySlots}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold px-4 py-2 text-xs transition-colors cursor-pointer shadow"
                >
                  <ArrowCounterClockwise size={14} weight="bold" />
                  Повторить запрос
                </button>
              </div>
            ) : slots.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-6 text-center">
                <Clock size={28} className="mx-auto text-zinc-500 mb-2" />
                <p className="text-sm font-semibold text-zinc-300">
                  На этот день нет свободного окна на {formatDurationHuman(totalDuration)}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Студия обслуживает 1 автомобиль одновременно для гарантии качества. Выберите другую дату.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {slots.map((slot) => {
                  const isSelected = selectedSlot?.starts_at === slot.starts_at
                  return (
                    <button
                      key={slot.starts_at}
                      type="button"
                      onClick={() => handleSelectSlot(slot)}
                      className={`flex flex-col items-center justify-center rounded-xl border py-2.5 px-3 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-transparent text-black font-extrabold shadow-md scale-[1.03]'
                          : 'border-white/10 bg-zinc-900 text-zinc-200 hover:border-white/30 hover:bg-zinc-800'
                      }`}
                      style={{
                        backgroundColor: isSelected ? brandColor : undefined,
                      }}
                    >
                      <span className="text-sm">{slot.formatted_time}</span>
                      <span className="text-[10px] opacity-70">свободно</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 3. Client & Vehicle Inputs */}
          <div className="space-y-4">
            <label className="block text-sm font-bold text-zinc-200">
              3. Данные клиента и автомобиля:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Ваше имя:
                </label>
                <div className="relative">
                  <User size={18} className="absolute left-3.5 top-3.5 text-zinc-500" />
                  <input
                    type="text"
                    required
                    placeholder="Например, Иван или Арман"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/90 py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-white/40 focus:ring-1 focus:ring-white/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Номер телефона (WhatsApp):
                </label>
                <div className="relative">
                  <Phone size={18} className="absolute left-3.5 top-3.5 text-zinc-500" />
                  <input
                    type="tel"
                    required
                    placeholder="+7 7XX XXX-XX-XX"
                    value={clientPhone}
                    onChange={handlePhoneChange}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/90 py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-white/40 focus:ring-1 focus:ring-white/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Марка автомобиля:
                </label>
                <div className="relative">
                  <Car size={18} className="absolute left-3.5 top-3.5 text-zinc-500" />
                  <input
                    type="text"
                    required
                    placeholder="Например: Toyota, BMW, Mercedes"
                    value={carMake}
                    onChange={(e) => setCarMake(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/90 py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-white/40 focus:ring-1 focus:ring-white/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Модель:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: Camry 70, X5, E-Class"
                  value={carModel}
                  onChange={(e) => setCarModel(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900/90 py-3 px-4 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-white/40 focus:ring-1 focus:ring-white/40"
                />
              </div>
            </div>
          </div>

          {/* Live Progress Checklist */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 text-xs space-y-1.5">
            <span className="font-bold text-zinc-300 block mb-1">
              Для перехода в WhatsApp с подготовленной заявкой:
            </span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
              <span className={hasServices ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                {hasServices ? '✓' : '○'} Услуги ({selectedServices.length})
              </span>
              <span className={hasSlot ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                {hasSlot ? `✓ Время (${selectedSlot?.formatted_time})` : '○ Время в календаре'}
              </span>
              <span className={hasName && hasPhone ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                {hasName && hasPhone ? '✓ Контакты' : '○ Имя и телефон'}
              </span>
              <span className={hasCar ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                {hasCar ? `✓ Авто (${carMake} ${carModel})` : '○ Марка и модель авто'}
              </span>
            </div>
          </div>

          {/* Form Error Alert */}
          {formError && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 animate-fade-up">
              <WarningCircle size={20} className="flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className={`flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-xl text-base font-extrabold transition-all duration-200 shadow-xl cursor-pointer ${
                isFormComplete
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/25 active:scale-[0.99]'
                  : 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 border border-white/10 hover:border-white/20'
              }`}
            >
              {submitting ? (
                <>
                  <SpinnerGap size={22} className="animate-spin text-black" />
                  <span className="text-black">Резервирование и переход в WhatsApp...</span>
                </>
              ) : isFormComplete ? (
                <>
                  <WhatsappLogo size={24} weight="fill" />
                  <span>Подтвердить запись и перейти в WhatsApp</span>
                </>
              ) : (
                <>
                  <WhatsappLogo size={24} weight="fill" className="text-zinc-500" />
                  <span>Заполните данные для перехода в WhatsApp</span>
                </>
              )}
            </button>
            <p className="mt-2 text-center text-xs text-zinc-400">
              {isFormComplete
                ? 'Все данные заполнены! Нажмите для бронирования и отправки заявки в WhatsApp.'
                : 'Кнопка перенесёт вас в WhatsApp после выбора времени в календаре и указания автомобиля.'}
            </p>
          </div>
        </form>
      )}
    </section>
  )
}
