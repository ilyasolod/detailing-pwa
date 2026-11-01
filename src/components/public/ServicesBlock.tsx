import React from 'react'
import type { Service, Company } from '../../types/database'
import { Check, Clock, Info, ArrowDown } from '@phosphor-icons/react'
import { formatDurationHuman } from '../../lib/detailing-engine'

interface ServicesBlockProps {
  company?: Company
  services: Service[]
  selectedServiceIds: string[]
  onToggleService: (serviceId: string) => void
  onProceedToBooking: () => void
  brandColor?: string
}

export const ServicesBlock: React.FC<ServicesBlockProps> = ({
  company,
  services,
  selectedServiceIds,
  onToggleService,
  onProceedToBooking,
  brandColor = '#E5A93C',
}) => {
  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id))
  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price_from, 0)
  const isSumMode = company?.duration_calculation_mode === 'sum'
  const totalDuration = isSumMode
    ? selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0)
    : (selectedServices.length ? Math.max(...selectedServices.map((s) => s.duration_minutes)) : 0)

  return (
    <section id="services-section" className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="border-b border-white/10 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Прайс-лист студии
            </span>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Каталог услуг
            </h2>
          </div>
          <span className="text-xs text-zinc-400">
            Выберите одну или несколько услуг одновременно
          </span>
        </div>
      </div>

      {/* Services List */}
      <div className="mt-6 space-y-3">
        {services.map((service) => {
          const isSelected = selectedServiceIds.includes(service.id)
          return (
            <div
              key={service.id}
              onClick={() => onToggleService(service.id)}
              className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5 transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'border-white/40 bg-zinc-800/80 shadow-lg ring-1 ring-white/30'
                  : 'border-white/10 bg-zinc-900/60 hover:border-white/20 hover:bg-zinc-900'
              }`}
            >
              {/* Left Info */}
              <div className="flex items-start gap-4">
                {/* Custom Checkbox */}
                <div
                  className={`mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border transition-all ${
                    isSelected
                      ? 'border-transparent text-black'
                      : 'border-white/20 bg-black/40 group-hover:border-white/40'
                  }`}
                  style={{
                    backgroundColor: isSelected ? brandColor : undefined,
                  }}
                >
                  {isSelected && <Check size={16} weight="bold" />}
                </div>

                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-zinc-100 sm:text-lg">
                    {service.name}
                  </h3>
                  {service.description && (
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed sm:text-sm max-w-xl">
                      {service.description}
                    </p>
                  )}
                  <div className="mt-2.5 flex items-center gap-3 text-xs text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Clock size={14} className="text-zinc-500" />
                      ~{formatDurationHuman(service.duration_minutes)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Price */}
              <div className="flex items-center justify-between sm:flex-col sm:items-end gap-1 border-t border-white/5 pt-3 sm:border-0 sm:pt-0">
                <span className="text-xs text-zinc-400 sm:text-right">Стоимость:</span>
                <span className="text-lg font-extrabold text-white whitespace-nowrap">
                  от {service.price_from.toLocaleString('ru-RU')} ₸
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating / Sticky Total Calculation Panel */}
      {selectedServices.length > 0 && (
        <div className="sticky bottom-4 z-40 mt-8 rounded-2xl border border-white/20 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-xl animate-fade-up">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Выбрано услуг: {selectedServices.length}
                </span>
                <span className="text-zinc-600">•</span>
                <span className="text-xs font-medium text-zinc-300">
                  Длительность: ~{formatDurationHuman(totalDuration)}
                  {!isSumMode && selectedServices.length > 1 && (
                    <span className="ml-1 text-[11px] text-zinc-400 font-normal">
                      (по самой долгой)
                    </span>
                  )}
                </span>
              </div>

              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xs text-zinc-400">Предварительно:</span>
                <span
                  className="text-2xl font-black tracking-tight"
                  style={{ color: brandColor }}
                >
                  от {totalPrice.toLocaleString('ru-RU')} ₸
                </span>
              </div>

              {/* Required ТЗ Disclaimer */}
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-tight text-zinc-400 max-w-md">
                <Info size={14} className="flex-shrink-0 mt-0.5 text-zinc-500" />
                «Указанная стоимость является предварительной. Итоговая цена определяется после осмотра автомобиля».
              </p>
            </div>

            <button
              type="button"
              onClick={onProceedToBooking}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-6 font-bold text-black shadow-lg transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ backgroundColor: brandColor }}
            >
              <span>Перейти к оформлению</span>
              <ArrowDown size={18} weight="bold" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
