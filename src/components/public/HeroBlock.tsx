import React from 'react'
import type { Company } from '../../types/database'
import { CalendarCheck, ShieldCheck, Clock, MapPin } from '@phosphor-icons/react'

interface HeroBlockProps {
  company: Company
  onScrollToServices: () => void
  onScrollToBooking: () => void
}

export const HeroBlock: React.FC<HeroBlockProps> = ({
  company,
  onScrollToServices,
  onScrollToBooking,
}) => {
  const brandColor = company.design_settings.primary_color || 'var(--brand-primary, #E5A93C)'
  const heroImage =
    company.design_settings.hero_image ||
    'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1600&q=85'

  return (
    <header className="relative w-full overflow-hidden border-b border-white/10 bg-[#08080A]">
      {/* Background Hero Image with atmospheric gradient overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt={company.name}
          className="h-full w-full object-cover object-center brightness-[0.45] filter transition-transform duration-700 hover:scale-105"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#08080A] via-[#08080A]/60 to-black/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.08),transparent_70%)]" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-20">
        {/* Top Studio Brand Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.name}
                className="h-12 w-12 rounded-xl object-cover ring-2 ring-white/15 shadow-lg"
              />
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl font-bold text-black shadow-lg"
                style={{ backgroundColor: brandColor }}
              >
                {company.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Онлайн-запись активна
              </span>
              <h2 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
                {company.name}
              </h2>
            </div>
          </div>

          {company.address && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <MapPin size={14} className="text-zinc-400" />
              <span>{company.address}</span>
            </div>
          )}
        </div>

        {/* Main Title & Tagline */}
        <div className="mt-12 sm:mt-16 max-w-2xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl sm:leading-tight">
            Премиальный уход и защита вашего автомобиля
          </h1>
          <p className="mt-4 text-base text-zinc-300 sm:text-lg sm:leading-relaxed">
            {company.description ||
              'Восстановительная полировка, керамические составы 9H, детейлинг-мойка и бронирование полиуретановой плёнкой.'}
          </p>
        </div>

        {/* Trust Badges */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 max-w-xl">
          <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md">
            <ShieldCheck size={20} style={{ color: brandColor }} />
            <span className="text-xs font-medium text-zinc-200">Гарантия на покрытие</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md">
            <Clock size={20} style={{ color: brandColor }} />
            <span className="text-xs font-medium text-zinc-200">Строго по графику</span>
          </div>
          <div className="col-span-2 sm:col-span-1 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md">
            <CalendarCheck size={20} style={{ color: brandColor }} />
            <span className="text-xs font-medium text-zinc-200">Запись за 2 минуты</span>
          </div>
        </div>

        {/* Actions — strictly guided booking funnel */}
        <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={onScrollToServices}
            className="group flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-7 font-bold text-black shadow-xl transition-all duration-200 hover:brightness-110 active:scale-[0.98] cursor-pointer"
            style={{ backgroundColor: brandColor }}
          >
            <CalendarCheck size={20} weight="bold" />
            <span>Выбрать услуги и записаться</span>
          </button>

          <button
            type="button"
            onClick={onScrollToBooking}
            className="flex min-h-[52px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 font-semibold text-zinc-200 backdrop-blur-sm transition-all duration-200 hover:bg-white/10 active:scale-[0.98] cursor-pointer"
          >
            Свободные даты
          </button>
        </div>
      </div>
    </header>
  )
}
