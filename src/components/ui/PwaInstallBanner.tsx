import React, { useState, useEffect } from 'react'
import { DownloadSimple, X, Export, PlusSquare, Sparkle } from '@phosphor-icons/react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaInstallBannerProps {
  accentColor?: string
  businessName?: string
}

export const PwaInstallBanner: React.FC<PwaInstallBannerProps> = ({
  accentColor = '#4690FF',
  businessName = 'студию',
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)

  useEffect(() => {
    // 1. Detect if already running standalone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
    setIsStandalone(standalone)

    // Check if dismissed in this session
    const dismissed = sessionStorage.getItem('pwa_banner_dismissed') === 'true'
    setIsDismissed(dismissed)

    // 3. Listen for Chrome/Android/Desktop install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setIsStandalone(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // If already running standalone as PWA, hide completely!
  if (isStandalone || isDismissed) {
    return null
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setIsStandalone(true)
      }
      setDeferredPrompt(null)
    } else {
      setShowIosGuide(true)
    }
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    sessionStorage.setItem('pwa_banner_dismissed', 'true')
  }

  return (
    <>
      {/* Floating Modern Header Pill Banner */}
      <div className="w-full px-4 pt-3 pb-1 z-30 animate-fade-up">
        <div className="max-w-md mx-auto p-2.5 rounded-2xl glass-card flex items-center justify-between gap-3 shadow-lg border-white/[0.08]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm"
              style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
            >
              <DownloadSimple size={18} weight="bold" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">Установить приложение</p>
              <p className="text-[11px] text-[var(--text-secondary)] truncate">Быстрый запуск с иконки на экране</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#0a0a0b] bg-white hover:bg-zinc-200 transition-all active:scale-95 shadow-sm cursor-pointer"
            >
              На экран
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              aria-label="Закрыть"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Installation Guide Modal Sheet */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-up">
          <div className="w-full max-w-sm rounded-3xl glass-modal p-6 space-y-5 text-zinc-100 shadow-2xl relative border-white/[0.1]">
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="text-center space-y-1.5 pt-2">
              <div
                className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-white shadow-md"
                style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
              >
                <Sparkle size={24} weight="fill" />
              </div>
              <h3 className="text-base font-bold text-white">Добавить на главный экран</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Запускайте {businessName} без адресной строки как мобильное приложение
              </p>
            </div>

            <div className="space-y-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/[0.08] text-white flex items-center justify-center shrink-0">
                  <Export size={16} weight="bold" />
                </div>
                <span className="text-zinc-200">1. Нажмите меню <b>«Поделиться»</b> (или три точки)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/[0.08] text-white flex items-center justify-center shrink-0">
                  <PlusSquare size={16} weight="bold" />
                </div>
                <span className="text-zinc-200">2. Выберите пункт <b>«На экран «Домой»»</b></span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="btn-primary w-full py-2.5 text-xs"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  )
}
