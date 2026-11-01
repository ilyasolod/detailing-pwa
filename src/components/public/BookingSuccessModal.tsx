import React from 'react'
import type { Company, Booking } from '../../types/database'
import { CheckCircle, WhatsappLogo, X, Clock } from '@phosphor-icons/react'
import { buildWhatsAppLink, formatDurationHuman } from '../../lib/detailing-engine'

interface BookingSuccessModalProps {
  company: Company
  booking: Booking
  onClose: () => void
}

export const BookingSuccessModal: React.FC<BookingSuccessModalProps> = ({
  company,
  booking,
  onClose,
}) => {
  const whatsappUrl = buildWhatsAppLink(company, booking)

  const dateObj = new Date(booking.starts_at)
  const dateStr = dateObj.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const timeStr = dateObj.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-up">
      <div className="relative w-full max-w-lg rounded-3xl border border-white/20 bg-zinc-950 p-6 sm:p-8 shadow-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Закрыть"
        >
          <X size={18} />
        </button>

        {/* Success Icon */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
            <CheckCircle size={28} weight="fill" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Заявка успешно создана
            </span>
            <h3 className="text-xl font-extrabold text-white">
              Номер брони: {booking.public_code}
            </h3>
          </div>
        </div>

        {/* 30-min Reservation Alert */}
        <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5">
          <div className="flex items-start gap-2.5">
            <Clock size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200 leading-relaxed">
              <strong>Время зарезервировано на 30 минут.</strong> Чтобы завершить оформление, отправьте заявку владельцу студии в WhatsApp.
            </p>
          </div>
        </div>

        {/* Summary Card */}
        <div className="mt-5 space-y-2.5 rounded-2xl border border-white/10 bg-zinc-900/60 p-4 text-xs text-zinc-300">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-zinc-400">Автомобиль:</span>
            <span className="font-semibold text-white">
              {booking.car_make} {booking.car_model}
            </span>
          </div>

          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-zinc-400">Дата и время:</span>
            <span className="font-semibold text-white">
              {dateStr}, {timeStr}
            </span>
          </div>

          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-zinc-400">Длительность:</span>
            <span className="font-semibold text-white">
              ~{formatDurationHuman(booking.total_duration_minutes)}
            </span>
          </div>

          <div className="pt-1">
            <span className="text-zinc-400 block mb-1">Услуги:</span>
            <ul className="space-y-1 pl-1">
              {booking.services_snapshot.map((s, idx) => (
                <li key={idx} className="flex justify-between text-zinc-200">
                  <span>• {s.name}</span>
                  <span className="font-semibold">от {s.price_from.toLocaleString('ru-RU')} ₸</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-2 font-bold text-sm">
            <span className="text-zinc-300">Предварительно:</span>
            <span className="text-emerald-400 text-base">
              от {booking.total_price_from.toLocaleString('ru-RU')} ₸
            </span>
          </div>
        </div>

        {/* WhatsApp Button */}
        <div className="mt-6">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-xl bg-emerald-500 font-extrabold text-black shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 active:scale-[0.98] text-sm sm:text-base"
          >
            <WhatsappLogo size={24} weight="fill" />
            <span>Перейти в WhatsApp</span>
          </a>
          <p className="mt-2 text-center text-[11px] text-zinc-400">
            Если WhatsApp не открылся автоматически, нажмите кнопку выше для перехода в диалог с подготовленным текстом.
          </p>
        </div>
      </div>
    </div>
  )
}
