import React from 'react'
import type { Company, WeeklyScheduleDay } from '../../types/database'
import { MapPin, WhatsappLogo, Clock } from '@phosphor-icons/react'

interface FooterBlockProps {
  company: Company
  schedule: WeeklyScheduleDay[]
  brandColor?: string
}

export const FooterBlock: React.FC<FooterBlockProps> = ({
  company,
  schedule,
  brandColor = '#E5A93C',
}) => {
  const weekdayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

  return (
    <footer className="border-t border-white/10 bg-[#060608] pt-12 pb-16 text-xs text-zinc-400">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10 border-b border-white/5">
          {/* Studio info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {company.logo_url ? (
                <img src={company.logo_url} alt={company.name} className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-black text-xs"
                  style={{ backgroundColor: brandColor }}
                >
                  {company.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="text-base font-bold text-white">{company.name}</span>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              {company.description}
            </p>
            {company.address && (
              <div className="flex items-center gap-2 text-zinc-300">
                <MapPin size={16} className="text-zinc-400 flex-shrink-0" />
                <span>{company.address}</span>
              </div>
            )}
          </div>

          {/* Schedule */}
          <div>
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5">
              <Clock size={16} className="text-zinc-400" />
              График работы студии
            </h4>
            <div className="space-y-1.5">
              {schedule.map((day) => (
                <div key={day.weekday} className="flex justify-between">
                  <span className="text-zinc-400">{weekdayNames[day.weekday]}:</span>
                  <span className={day.is_working ? 'text-zinc-200 font-medium' : 'text-zinc-500'}>
                    {day.is_working ? `${day.opening_time} – ${day.closing_time}` : 'Выходной'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Contacts */}
          <div>
            <h4 className="text-sm font-bold text-white mb-3">Контакты и связь</h4>
            <p className="text-zinc-400 mb-4">
              Возникли вопросы по услугам или нестандартным работам? Напишите владельцу студии напрямую.
            </p>
            <a
              href={`https://wa.me/${company.whatsapp_number.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2.5 font-semibold text-white transition-colors"
            >
              <WhatsappLogo size={18} className="text-emerald-400" />
              <span>WhatsApp студии</span>
            </a>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-500">
          <div>
            © {new Date().getFullYear()} {company.name}. Все права защищены.
          </div>
          <div className="flex items-center gap-3">
            <span>Автономное веб-приложение PWA</span>
            <span>•</span>
            <a
              href={`/c/${company.slug}/admin`}
              className="text-zinc-400 hover:text-white transition-colors underline decoration-white/20 underline-offset-4"
            >
              Вход для владельца
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
