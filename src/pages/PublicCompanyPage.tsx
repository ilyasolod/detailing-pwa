import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router'
import type { CompanyPublicData, Booking } from '../types/database'
import { getCompanyBySlug } from '../lib/detailing-engine'
import { getCompanyCssVariables } from '../lib/theme'
import { HeroBlock } from '../components/public/HeroBlock'
import { PortfolioBlock } from '../components/public/PortfolioBlock'
import { ServicesBlock } from '../components/public/ServicesBlock'
import { BookingFormBlock } from '../components/public/BookingFormBlock'
import { BookingSuccessModal } from '../components/public/BookingSuccessModal'
import { FooterBlock } from '../components/public/FooterBlock'
import { SpinnerGap, WarningCircle, WifiSlash, ArrowCounterClockwise } from '@phosphor-icons/react'

export const PublicCompanyPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<CompanyPublicData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isNotFound, setIsNotFound] = useState<boolean>(false)
  const [retryCount, setRetryCount] = useState<number>(0)

  // Selected services state for multi-selection
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])

  // Modal state when a booking is created
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null)

  useEffect(() => {
    let isCurrent = true
    if (!slug) {
      setIsNotFound(true)
      setError('Не указан идентификатор студии')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setIsNotFound(false)

    getCompanyBySlug(slug)
      .then((res) => {
        if (!isCurrent) return
        if (!res) {
          setIsNotFound(true)
          setError(`Детейлинг-центр «${slug}» не найден или деактивирован.`)
        } else {
          setIsNotFound(false)
          setData(res)
          // Default: select the first service to provide immediate calculation
          if (res.services.length > 0 && res.services[0]) {
            setSelectedServiceIds([res.services[0].id])
          }
        }
      })
      .catch((err) => {
        if (isCurrent) {
          setIsNotFound(false)
          setError(err instanceof Error ? err.message : 'Ошибка при загрузке студии')
        }
      })
      .finally(() => {
        if (isCurrent) setLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [slug, retryCount])

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1)
  }

  const handleToggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) => {
      if (prev.includes(serviceId)) {
        return prev.filter((id) => id !== serviceId)
      } else {
        return [...prev, serviceId]
      }
    })
  }

  const handleScrollToServices = () => {
    document.getElementById('services-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleScrollToBooking = () => {
    document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#08080A] text-white">
        <SpinnerGap size={36} className="animate-spin text-amber-400 mb-3" />
        <p className="text-sm text-zinc-400">Загрузка детейлинг-центра...</p>
      </div>
    )
  }

  if (error || !data) {
    const isNetworkOrServerError = !isNotFound && Boolean(error)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#08080A] p-6 text-center text-white">
        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-8 max-w-md w-full shadow-2xl">
          {isNetworkOrServerError ? (
            <WifiSlash size={44} className="mx-auto text-amber-400 mb-4" />
          ) : (
            <WarningCircle size={44} className="mx-auto text-amber-400 mb-4" />
          )}
          <h2 className="text-xl font-bold">
            {isNetworkOrServerError ? 'Ошибка подключения к серверу' : 'Студия не найдена'}
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            {error || 'Детейлинг-центр не зарегистрирован в системе или ссылка некорректна.'}
          </p>

          {isNetworkOrServerError && (
            <button
              type="button"
              onClick={handleRetry}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold px-5 py-2.5 text-sm transition-colors cursor-pointer w-full shadow-lg"
            >
              <ArrowCounterClockwise size={18} weight="bold" />
              Повторить попытку
            </button>
          )}
        </div>
      </div>
    )
  }

  const { company, services, gallery_photos, weekly_schedule } = data
  const cssVariables = getCompanyCssVariables(company.design_settings)
  const brandColor = company.design_settings.primary_color || 'var(--brand-primary, #E5A93C)'

  return (
    <div
      style={cssVariables}
      className="min-h-screen bg-[var(--bg-custom-base,#0A0A0C)] text-zinc-100 flex flex-col antialiased selection:bg-white selection:text-black"
    >
      <main className="flex-1">
        {/* 1. Hero Screen */}
        <HeroBlock
          company={company}
          onScrollToServices={handleScrollToServices}
          onScrollToBooking={handleScrollToBooking}
        />

        {/* 2. Portfolio Gallery */}
        <PortfolioBlock photos={gallery_photos} brandColor={brandColor} />

        {/* 3 & 4 & 5. Services Catalog with Multi-Selection & Calculation */}
        <ServicesBlock
          company={company}
          services={services}
          selectedServiceIds={selectedServiceIds}
          onToggleService={handleToggleService}
          onProceedToBooking={handleScrollToBooking}
          brandColor={brandColor}
        />

        {/* 6 & 7. Booking Form & Slot Picker */}
        <BookingFormBlock
          company={company}
          services={services}
          selectedServiceIds={selectedServiceIds}
          onBookingCreated={(booking) => setCreatedBooking(booking)}
          brandColor={brandColor}
        />
      </main>

      {/* 8. Footer Contacts & Schedule */}
      <FooterBlock company={company} schedule={weekly_schedule} brandColor={brandColor} />

      {/* Booking Success Modal & WhatsApp Redirect */}
      {createdBooking && (
        <BookingSuccessModal
          company={company}
          booking={createdBooking}
          onClose={() => setCreatedBooking(null)}
        />
      )}
    </div>
  )
}
