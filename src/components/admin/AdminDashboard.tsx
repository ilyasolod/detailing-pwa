import React, { useState, useEffect } from 'react'
import type {
  Company,
  Booking,
  Service,
  GalleryPhoto,
  WeeklyScheduleDay,
  ScheduleBreak,
  BlockedInterval,
} from '../../types/database'
import {
  getOwnerDashboardData,
  updateBookingStatus,
  rescheduleBooking,
  createManualBooking,
  createBlockedInterval,
  deleteBlockedInterval,
  saveService,
  deleteService,
  addPortfolioPhoto,
  deletePortfolioPhoto,
  updateCompanySettings,
  updateSchedule,
  formatDurationHuman,
  uploadImageFile,
  getCompanyCredentials,
  updateCompanyLogin,
  updateCompanyPassword,
} from '../../lib/detailing-engine'
import {
  CalendarBlank,
  ClipboardText,
  Wrench,
  Images,
  Gear,
  Clock,
  SignOut,
  Plus,
  CheckCircle,
  XCircle,
  WhatsappLogo,
  ArrowSquareOut,
  Trash,
  PencilSimple,
  SpinnerGap,
  Lock,
  Car,
  Phone,
  Timer,
  UploadSimple,
  Key,
  Eye,
  EyeSlash,
  User,
} from '@phosphor-icons/react'

interface AdminDashboardProps {
  companyId: string
  onLogout: () => void
}

type TabKey = 'calendar' | 'bookings' | 'services' | 'portfolio' | 'settings' | 'schedule'

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ companyId, onLogout }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('bookings')
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // State
  const [company, setCompany] = useState<Company | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [gallery, setGallery] = useState<GalleryPhoto[]>([])
  const [schedule, setSchedule] = useState<WeeklyScheduleDay[]>([])
  const [breaks, setBreaks] = useState<ScheduleBreak[]>([])
  const [blocks, setBlocks] = useState<BlockedInterval[]>([])

  // Booking status filter
  const [bookingFilter, setBookingFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled'>('all')

  // Modals state
  const [manualBookingModalOpen, setManualBookingModalOpen] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false)
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null)
  const [newRescheduleTime, setNewRescheduleTime] = useState<string>('')

  // Form states
  const [manualForm, setManualForm] = useState({
    clientName: '',
    clientPhone: '+7 ',
    carMake: '',
    carModel: '',
    serviceNames: 'Комплексный детейлинг',
    totalPrice: 25000,
    date: new Date().toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '12:00',
  })

  const [blockForm, setBlockForm] = useState({
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '19:00',
    reason: 'Технический день / Санитарная обработка',
  })

  const [newPhotoUrl, setNewPhotoUrl] = useState('')

  // Device file upload states & refs
  const [uploadingPortfolioPhoto, setUploadingPortfolioPhoto] = useState(false)
  const [uploadingServicePhoto, setUploadingServicePhoto] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingHero, setUploadingHero] = useState(false)

  const portfolioFileInputRef = React.useRef<HTMLInputElement>(null)
  const serviceFileInputRef = React.useRef<HTMLInputElement>(null)
  const logoFileInputRef = React.useRef<HTMLInputElement>(null)
  const heroFileInputRef = React.useRef<HTMLInputElement>(null)

  // Owner credentials change state
  const [currentCompanyLogin, setCurrentCompanyLogin] = useState('Админ')
  const [newLogin, setNewLogin] = useState('')
  const [passwordForLoginChange, setPasswordForLoginChange] = useState('')
  const [changingLogin, setChangingLogin] = useState(false)

  // Owner password change state
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await getOwnerDashboardData(companyId)
      const creds = getCompanyCredentials(companyId)
      setCurrentCompanyLogin(creds.login)
      setCompany(data.company)
      setBookings(data.bookings)
      setServices(data.services)
      setGallery(data.gallery_photos)
      setSchedule(data.weekly_schedule)
      setBreaks(data.schedule_breaks)
      setBlocks(data.blocked_intervals)
    } catch (err: unknown) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 4000)
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleUpdateStatus = async (id: string, status: 'confirmed' | 'cancelled' | 'completed') => {
    try {
      await updateBookingStatus(companyId, id, status)
      notify(`Статус заявки изменён на: ${status}`)
      loadData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    }
  }

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reschedulingBooking || !newRescheduleTime) return
    try {
      await rescheduleBooking(companyId, reschedulingBooking.id, new Date(newRescheduleTime).toISOString())
      notify('Заявка успешно перенесена')
      setRescheduleModalOpen(false)
      loadData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка переноса', 'error')
    }
  }

  const handleCreateManualBooking = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const startsAt = new Date(`${manualForm.date}T${manualForm.startTime}:00`).toISOString()
      const endsAt = new Date(`${manualForm.date}T${manualForm.endTime}:00`).toISOString()

      await createManualBooking({
        companyId,
        clientName: manualForm.clientName,
        clientPhone: manualForm.clientPhone,
        carMake: manualForm.carMake,
        carModel: manualForm.carModel,
        serviceNames: manualForm.serviceNames,
        totalPrice: Number(manualForm.totalPrice),
        startsAt,
        endsAt,
      })
      notify('Ручная запись успешно создана')
      setManualBookingModalOpen(false)
      loadData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка создания', 'error')
    }
  }

  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const startsAt = new Date(`${blockForm.date}T${blockForm.startTime}:00`).toISOString()
      const endsAt = new Date(`${blockForm.date}T${blockForm.endTime}:00`).toISOString()
      await createBlockedInterval({
        companyId,
        startsAt,
        endsAt,
        reason: blockForm.reason,
      })
      notify('Интервал заблокирован')
      setBlockModalOpen(false)
      loadData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка блокировки', 'error')
    }
  }

  const handleDeleteBlock = async (id: string) => {
    try {
      await deleteBlockedInterval(companyId, id)
      notify('Блокировка снята')
      loadData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    }
  }

  const handleSaveService = async (service: Service) => {
    try {
      await saveService(service)
      notify('Услуга сохранена')
      setServiceModalOpen(false)
      loadData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    }
  }

  const handleDeleteService = async (id: string) => {
    if (!confirm('Удалить эту услугу из каталога?')) return
    try {
      await deleteService(companyId, id)
      notify('Услуга удалена')
      loadData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    }
  }

  const handlePortfolioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPortfolioPhoto(true)
    try {
      const url = await uploadImageFile(companyId, file, 'portfolio')
      await addPortfolioPhoto(companyId, url)
      notify('Фотография успешно загружена с устройства и добавлена в портфолио!')
      loadData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка загрузки фото', 'error')
    } finally {
      setUploadingPortfolioPhoto(false)
      if (portfolioFileInputRef.current) portfolioFileInputRef.current.value = ''
    }
  }

  const handleServiceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editingService) return
    setUploadingServicePhoto(true)
    try {
      const url = await uploadImageFile(companyId, file, 'services')
      setEditingService({ ...editingService, image_url: url })
      notify('Изображение услуги успешно загружено с устройства!')
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка загрузки фото', 'error')
    } finally {
      setUploadingServicePhoto(false)
      if (serviceFileInputRef.current) serviceFileInputRef.current.value = ''
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !company) return
    setUploadingLogo(true)
    try {
      const url = await uploadImageFile(companyId, file, 'branding')
      setCompany({ ...company, logo_url: url })
      notify('Логотип загружен с устройства! Нажмите "Сохранить изменения" для фиксации.')
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка загрузки логотипа', 'error')
    } finally {
      setUploadingLogo(false)
      if (logoFileInputRef.current) logoFileInputRef.current.value = ''
    }
  }

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !company) return
    setUploadingHero(true)
    try {
      const url = await uploadImageFile(companyId, file, 'branding')
      setCompany({
        ...company,
        design_settings: {
          ...company.design_settings,
          hero_image: url,
        },
      })
      notify('Баннер загружен с устройства! Нажмите "Сохранить изменения" для фиксации.')
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка загрузки баннера', 'error')
    } finally {
      setUploadingHero(false)
      if (heroFileInputRef.current) heroFileInputRef.current.value = ''
    }
  }

  const handleChangeLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLogin || newLogin.trim().length < 2) {
      notify('Логин должен содержать не менее 2 символов', 'error')
      return
    }
    if (!passwordForLoginChange) {
      notify('Введите текущий пароль для подтверждения смены логина', 'error')
      return
    }

    setChangingLogin(true)
    try {
      await updateCompanyLogin({
        companyId,
        currentPassword: passwordForLoginChange.trim(),
        newLogin: newLogin.trim(),
      })
      setCurrentCompanyLogin(newLogin.trim())
      notify('Логин студии успешно изменён! Запомните регистр и раскладку.')
      setNewLogin('')
      setPasswordForLoginChange('')
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка смены логина', 'error')
    } finally {
      setChangingLogin(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || newPassword.trim().length < 6) {
      notify('Новый пароль должен содержать не менее 6 символов', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      notify('Новый пароль и подтверждение не совпадают', 'error')
      return
    }

    setChangingPassword(true)
    try {
      await updateCompanyPassword({
        companyId,
        newPassword: newPassword.trim(),
        currentPassword: oldPassword ? oldPassword.trim() : '',
      })
      notify('Пароль учётной записи владельца успешно изменён!')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка смены пароля', 'error')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleAddPhoto = async () => {
    if (!newPhotoUrl.trim()) return
    try {
      await addPortfolioPhoto(companyId, newPhotoUrl.trim())
      setNewPhotoUrl('')
      notify('Фотография добавлена в портфолио')
      loadData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    }
  }

  const handleDeletePhoto = async (id: string) => {
    try {
      await deletePortfolioPhoto(companyId, id)
      notify('Фотография удалена')
      loadData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    }
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company) return
    setSaving(true)
    try {
      await updateCompanySettings(companyId, company)
      notify('Настройки компании обновлены')
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка сохранения', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSchedule = async () => {
    setSaving(true)
    try {
      await updateSchedule(companyId, schedule, breaks)
      notify('Рабочий график и перерывы сохранены')
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Ошибка сохранения', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !company) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#08080A] text-white">
        <SpinnerGap size={36} className="animate-spin text-amber-400 mb-3" />
        <p className="text-sm text-zinc-400">Загрузка панели управления...</p>
      </div>
    )
  }

  const filteredBookings = bookings.filter((b) => {
    if (bookingFilter === 'all') return true
    return b.status === bookingFilter
  })

  return (
    <div className="min-h-screen bg-[#08080A] text-zinc-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-white/10 bg-zinc-950/80 px-4 py-3 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {company.logo_url ? (
              <img src={company.logo_url} alt="" className="h-9 w-9 rounded-xl object-cover ring-1 ring-white/15" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 font-bold text-black text-xs">
                {company.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white sm:text-base">{company.name}</h1>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  Активна
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                Панель управления детейлингом
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`/c/${company.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/10"
            >
              <span>Сайт</span>
              <ArrowSquareOut size={14} />
            </a>

            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20"
            >
              <SignOut size={14} />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </div>
      </header>

      {/* Notifications banner */}
      {message && (
        <div
          className={`px-4 py-2 text-center text-xs font-semibold animate-fade-up ${
            message.type === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Nav Tabs */}
      <div className="border-b border-white/10 bg-zinc-950">
        <div className="mx-auto flex max-w-6xl overflow-x-auto px-4 py-1 gap-1 text-xs font-semibold scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('bookings')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'bookings'
                ? 'bg-amber-400 text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ClipboardText size={16} />
            <span>Заявки ({bookings.filter((b) => b.status === 'pending').length} новых)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-amber-400 text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <CalendarBlank size={16} />
            <span>Календарь</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('services')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'services'
                ? 'bg-amber-400 text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Wrench size={16} />
            <span>Услуги ({services.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('portfolio')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'portfolio'
                ? 'bg-amber-400 text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Images size={16} />
            <span>Портфолио ({gallery.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'schedule'
                ? 'bg-amber-400 text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Clock size={16} />
            <span>График</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-amber-400 text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Gear size={16} />
            <span>Настройки</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        {/* ── TAB 1: BOOKINGS ──────────────────────────────────────────────── */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-white">Список заявок</h2>
                <p className="text-xs text-zinc-400">Управление клиентскими записями студии</p>
              </div>

              {/* Status Filters */}
              <div className="flex flex-wrap gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10 text-xs">
                {(['all', 'pending', 'confirmed', 'completed', 'cancelled'] as const).map((filter) => {
                  const labels: Record<string, string> = {
                    all: 'Все',
                    pending: 'Ожидают',
                    confirmed: 'Подтверждены',
                    completed: 'Выполнены',
                    cancelled: 'Отменены',
                  }
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setBookingFilter(filter)}
                      className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                        bookingFilter === filter
                          ? 'bg-white/20 text-white font-bold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {labels[filter]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Bookings List */}
            {filteredBookings.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-12 text-center">
                <ClipboardText size={40} className="mx-auto text-zinc-500 mb-3" />
                <h3 className="text-base font-bold text-white">Заявок нет</h3>
                <p className="mt-1 text-xs text-zinc-400">В этой категории отсутствуют записи.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredBookings.map((b) => {
                  const startDate = new Date(b.starts_at)
                  const isPending = b.status === 'pending'
                  const isConfirmed = b.status === 'confirmed'

                  return (
                    <div
                      key={b.id}
                      className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5 shadow-lg space-y-4"
                    >
                      <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-amber-400">
                              #{b.public_code}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                isPending
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : isConfirmed
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : b.status === 'completed'
                                  ? 'bg-blue-500/20 text-blue-300'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {b.status}
                            </span>
                          </div>
                          <h4 className="mt-1 text-base font-bold text-white">{b.client_name}</h4>
                        </div>

                        <div className="text-right">
                          <span className="text-xs text-zinc-400">Предварительно:</span>
                          <div className="text-base font-extrabold text-white">
                            от {b.total_price_from.toLocaleString('ru-RU')} ₸
                          </div>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300">
                        <div className="flex items-center gap-1.5">
                          <Car size={15} className="text-zinc-500" />
                          <span>{b.car_make} {b.car_model}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone size={15} className="text-zinc-500" />
                          <a href={`tel:${b.client_phone}`} className="text-zinc-300 hover:underline">
                            {b.client_phone}
                          </a>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={15} className="text-zinc-500" />
                          <span>
                            {startDate.toLocaleDateString('ru-RU')}, {startDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Timer size={15} className="text-zinc-500" />
                          <span>~{formatDurationHuman(b.total_duration_minutes)}</span>
                        </div>
                      </div>

                      {/* Services list */}
                      <div className="rounded-xl bg-black/30 p-2.5 text-xs text-zinc-400 space-y-1">
                        <span className="font-semibold text-zinc-300 text-[11px] block">Услуги:</span>
                        {b.services_snapshot.map((s, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>• {s.name}</span>
                            <span className="text-zinc-300">от {s.price_from.toLocaleString('ru-RU')} ₸</span>
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(b.id, 'confirmed')}
                            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs font-bold text-black transition-colors"
                          >
                            <CheckCircle size={15} weight="bold" />
                            <span>Подтвердить</span>
                          </button>
                        )}

                        {isConfirmed && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(b.id, 'completed')}
                            className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-bold text-white transition-colors"
                          >
                            <CheckCircle size={15} weight="bold" />
                            <span>Завершить</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setReschedulingBooking(b)
                            setNewRescheduleTime(b.starts_at.slice(0, 16))
                            setRescheduleModalOpen(true)
                          }}
                          className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors"
                        >
                          <Clock size={15} />
                          <span>Перенести</span>
                        </button>

                        {b.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(b.id, 'cancelled')}
                            className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors"
                          >
                            <XCircle size={15} />
                            <span>Отменить</span>
                          </button>
                        )}

                        <a
                          href={`https://wa.me/${b.client_phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto flex items-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                        >
                          <WhatsappLogo size={16} />
                          <span>Написать</span>
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: CALENDAR ──────────────────────────────────────────────── */}
        {activeTab === 'calendar' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-white">Календарь занятости</h2>
                <p className="text-xs text-zinc-400">Просмотр расписания, ручная запись и блокировка времени</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManualBookingModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 px-3.5 py-2 text-xs font-bold text-black shadow-md transition-colors"
                >
                  <Plus size={16} weight="bold" />
                  <span>Внести запись вручную</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBlockModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition-colors"
                >
                  <Lock size={16} />
                  <span>Блокировать интервал</span>
                </button>
              </div>
            </div>

            {/* Active Blocked Intervals */}
            {blocks.length > 0 && (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
                  Активные ручные блокировки ({blocks.length}):
                </h3>
                <div className="space-y-2">
                  {blocks.map((block) => (
                    <div key={block.id} className="flex items-center justify-between text-xs text-zinc-200 bg-black/40 p-2.5 rounded-xl border border-white/5">
                      <div>
                        <strong>{new Date(block.starts_at).toLocaleString('ru-RU')}</strong> —{' '}
                        {new Date(block.ends_at).toLocaleString('ru-RU')}
                        {block.reason && <span className="text-zinc-400 ml-2">({block.reason})</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteBlock(block.id)}
                        className="text-red-400 hover:text-red-300 text-xs underline ml-4"
                      >
                        Снять
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chronological Schedule View */}
            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5 space-y-4">
              <h3 className="text-sm font-bold text-white">Все подтверждённые и ожидающие записи:</h3>
              <div className="divide-y divide-white/10">
                {bookings
                  .filter((b) => b.status === 'confirmed' || b.status === 'pending')
                  .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
                  .map((b) => (
                    <div key={b.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center justify-center min-w-[65px] rounded-xl bg-zinc-900 border border-white/10 p-1.5 text-center">
                          <span className="text-[10px] text-zinc-400 uppercase">
                            {new Date(b.starts_at).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-xs font-extrabold text-white">
                            {new Date(b.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white">{b.client_name} ({b.car_make} {b.car_model})</span>
                          <div className="text-[11px] text-zinc-400">
                            {b.services_snapshot.map((s) => s.name).join(', ')} • {formatDurationHuman(b.total_duration_minutes)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-amber-400">#{b.public_code}</span>
                        <span className="text-xs text-zinc-300">от {b.total_price_from.toLocaleString('ru-RU')} ₸</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: SERVICES ──────────────────────────────────────────────── */}
        {activeTab === 'services' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-white">Управление услугами</h2>
                <p className="text-xs text-zinc-400">Редактирование цен, продолжительности и активности</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingService({
                    id: crypto.randomUUID ? crypto.randomUUID() : `srv-${Date.now()}`,
                    company_id: companyId,
                    name: '',
                    description: '',
                    price_from: 10000,
                    duration_minutes: 60,
                    image_url: null,
                    active: true,
                    sort_order: services.length + 1,
                  })
                  setServiceModalOpen(true)
                }}
                className="flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 px-3.5 py-2 text-xs font-bold text-black shadow-md transition-colors"
              >
                <Plus size={16} weight="bold" />
                <span>Добавить услугу</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-bold text-white">{service.name}</h3>
                      <button
                        type="button"
                        onClick={() => handleSaveService({ ...service, active: !service.active })}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase transition-colors ${
                          service.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        {service.active ? 'Активна' : 'Отключена'}
                      </button>
                    </div>

                    {service.description && (
                      <p className="mt-1 text-xs text-zinc-400">{service.description}</p>
                    )}

                    <div className="mt-4 flex items-center justify-between text-xs border-t border-white/5 pt-3">
                      <span className="text-zinc-400">
                        Длительность: <strong className="text-white">{formatDurationHuman(service.duration_minutes)}</strong>
                      </span>
                      <span className="text-sm font-extrabold text-amber-400">
                        от {service.price_from.toLocaleString('ru-RU')} ₸
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingService(service)
                        setServiceModalOpen(true)
                      }}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10 transition-colors"
                    >
                      <PencilSimple size={14} />
                      <span>Изменить</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteService(service.id)}
                      className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      <Trash size={14} />
                      <span>Удалить</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 4: PORTFOLIO ─────────────────────────────────────────────── */}
        {activeTab === 'portfolio' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-extrabold text-white">Портфолио работ</h2>
              <p className="text-xs text-zinc-400">Загрузка и управление фотографиями детейлинга</p>
            </div>

            {/* Hidden device file input */}
            <input
              type="file"
              ref={portfolioFileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handlePortfolioFileUpload}
            />

            {/* Upload Zone from Device */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                onClick={() => !uploadingPortfolioPhoto && portfolioFileInputRef.current?.click()}
                className="group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-white/20 bg-zinc-900/40 hover:border-amber-400 hover:bg-zinc-900/80 transition-all cursor-pointer text-center"
              >
                {uploadingPortfolioPhoto ? (
                  <div className="flex flex-col items-center py-2">
                    <SpinnerGap size={32} className="animate-spin text-amber-400 mb-2" />
                    <span className="text-xs font-semibold text-white">Загрузка и оптимизация фото...</span>
                    <span className="text-[11px] text-zinc-400">Пожалуйста, подождите</span>
                  </div>
                ) : (
                  <>
                    <div className="h-12 w-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-110 transition-transform">
                      <UploadSimple size={24} weight="bold" />
                    </div>
                    <span className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                      Загрузить фото с устройства
                    </span>
                    <span className="text-xs text-zinc-400 mt-1">
                      Нажмите для выбора из галереи или съёмки на камеру
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">
                      JPG, PNG, WEBP • До 15 МБ
                    </span>
                  </>
                )}
              </div>

              {/* Add Photo by URL */}
              <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 flex flex-col justify-between">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Или добавить по прямой ссылке (URL):
                  </label>
                  <p className="text-[11px] text-zinc-400 mb-3">
                    Вставьте интернет-ссылку на фотографию (например, из Unsplash или вашего хостинга).
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/photo-..."
                    value={newPhotoUrl}
                    onChange={(e) => setNewPhotoUrl(e.target.value)}
                    className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={handleAddPhoto}
                    className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-black hover:bg-amber-300 transition-colors"
                  >
                    <Plus size={16} weight="bold" />
                    <span>Добавить</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Photo Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {gallery.map((photo) => (
                <div key={photo.id} className="group relative aspect-video rounded-xl border border-white/10 overflow-hidden bg-zinc-900">
                  <img src={photo.image_url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-lg opacity-90 hover:opacity-100 transition-opacity"
                    aria-label="Удалить"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 5: SCHEDULE ──────────────────────────────────────────────── */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-white">Рабочий график</h2>
                <p className="text-xs text-zinc-400">Настройка рабочих дней, времени открытия, закрытия и перерывов</p>
              </div>
              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={saving}
                className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-black hover:bg-amber-300 transition-colors"
              >
                {saving ? 'Сохранение...' : 'Сохранить график'}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 space-y-4">
              <h3 className="text-sm font-bold text-white mb-2">Дни недели:</h3>
              <div className="space-y-3">
                {schedule.map((day, idx) => {
                  const names = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
                  return (
                    <div
                      key={day.weekday}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/40 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={day.is_working}
                          onChange={(e) => {
                            const updated = [...schedule]
                            const current = updated[idx]
                            if (current) current.is_working = e.target.checked
                            setSchedule(updated)
                          }}
                          className="h-4 w-4 rounded accent-amber-400"
                        />
                        <span className="text-sm font-semibold text-white">{names[day.weekday]}</span>
                      </div>

                      {day.is_working && (
                        <div className="flex items-center gap-2 text-xs text-zinc-300">
                          <span>С:</span>
                          <input
                            type="time"
                            value={day.opening_time}
                            onChange={(e) => {
                              const updated = [...schedule]
                              const current = updated[idx]
                              if (current) current.opening_time = e.target.value
                              setSchedule(updated)
                            }}
                            className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-white"
                          />
                          <span>До:</span>
                          <input
                            type="time"
                            value={day.closing_time}
                            onChange={(e) => {
                              const updated = [...schedule]
                              const current = updated[idx]
                              if (current) current.closing_time = e.target.value
                              setSchedule(updated)
                            }}
                            className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-white"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 6: SETTINGS ──────────────────────────────────────────────── */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-2xl">
            <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-white">Настройки компании</h2>
                <p className="text-xs text-zinc-400">Контакты, фирменный стиль и параметры студии</p>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-black hover:bg-amber-300 transition-colors"
              >
                {saving ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Название студии:</label>
                <input
                  type="text"
                  required
                  value={company.name}
                  onChange={(e) => setCompany({ ...company, name: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Описание:</label>
                <textarea
                  rows={3}
                  value={company.description || ''}
                  onChange={(e) => setCompany({ ...company, description: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Номер WhatsApp:</label>
                  <input
                    type="text"
                    required
                    value={company.whatsapp_number}
                    onChange={(e) => setCompany({ ...company, whatsapp_number: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Часовой пояс:</label>
                  <input
                    type="text"
                    value={company.timezone}
                    onChange={(e) => setCompany({ ...company, timezone: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Адрес студии:</label>
                <input
                  type="text"
                  value={company.address || ''}
                  onChange={(e) => setCompany({ ...company, address: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              {/* Design Settings */}
              <div className="border-t border-white/10 pt-4 space-y-4">
                <h3 className="text-sm font-bold text-white">Визуальная персонализация (Automotive Premium):</h3>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Визуальный характер (Theme Preset):</label>
                  <select
                    value={company.design_settings.theme_preset}
                    onChange={(e) =>
                      setCompany({
                        ...company,
                        design_settings: {
                          ...company.design_settings,
                          theme_preset: e.target.value as 'dark_studio' | 'clean_automotive' | 'performance',
                        },
                      })
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white"
                  >
                    <option value="dark_studio">Dark Studio (Тёмная эстетика, золотой/янтарный акцент)</option>
                    <option value="clean_automotive">Clean Automotive (Чистый технологичный стиль, синий акцент)</option>
                    <option value="performance">Performance (Спортивный динамичный характер, красный акцент)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Основной цвет:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={company.design_settings.primary_color || '#E5A93C'}
                        onChange={(e) =>
                          setCompany({
                            ...company,
                            design_settings: { ...company.design_settings, primary_color: e.target.value },
                          })
                        }
                        className="h-9 w-9 rounded cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={company.design_settings.primary_color}
                        onChange={(e) =>
                          setCompany({
                            ...company,
                            design_settings: { ...company.design_settings, primary_color: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Акцентный цвет:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={company.design_settings.accent_color || '#F59E0B'}
                        onChange={(e) =>
                          setCompany({
                            ...company,
                            design_settings: { ...company.design_settings, accent_color: e.target.value },
                          })
                        }
                        className="h-9 w-9 rounded cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={company.design_settings.accent_color}
                        onChange={(e) =>
                          setCompany({
                            ...company,
                            design_settings: { ...company.design_settings, accent_color: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Hidden file inputs for branding */}
                <input
                  type="file"
                  ref={logoFileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <input
                  type="file"
                  ref={heroFileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleHeroUpload}
                />

                {/* Logo & Hero Image with device upload */}
                <div className="space-y-4 pt-2 border-t border-white/10">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Логотип студии:</label>
                    <div className="flex items-center gap-3">
                      {company.logo_url && (
                        <img src={company.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/20 shrink-0" />
                      )}
                      <div className="flex-1 flex gap-2">
                        <input
                          type="url"
                          placeholder="https://... URL логотипа"
                          value={company.logo_url || ''}
                          onChange={(e) => setCompany({ ...company, logo_url: e.target.value })}
                          className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white"
                        />
                        <button
                          type="button"
                          onClick={() => logoFileInputRef.current?.click()}
                          disabled={uploadingLogo}
                          className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs text-zinc-200 transition-colors"
                        >
                          {uploadingLogo ? <SpinnerGap size={14} className="animate-spin" /> : <UploadSimple size={14} />}
                          <span>С устройства</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Главный баннер (Hero Image):</label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="url"
                          placeholder="https://... URL главного баннера"
                          value={company.design_settings.hero_image || ''}
                          onChange={(e) =>
                            setCompany({
                              ...company,
                              design_settings: { ...company.design_settings, hero_image: e.target.value },
                            })
                          }
                          className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white"
                        />
                        <button
                          type="button"
                          onClick={() => heroFileInputRef.current?.click()}
                          disabled={uploadingHero}
                          className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs text-zinc-200 transition-colors"
                        >
                          {uploadingHero ? <SpinnerGap size={14} className="animate-spin" /> : <UploadSimple size={14} />}
                          <span>С устройства</span>
                        </button>
                      </div>
                      {company.design_settings.hero_image && (
                        <div className="aspect-video max-h-32 rounded-xl overflow-hidden border border-white/10">
                          <img src={company.design_settings.hero_image} alt="" className="h-full w-full object-cover" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Duration calculation mode */}
                <div className="pt-4 border-t border-white/10 space-y-2">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Правило расчёта времени при заказе нескольких услуг:
                  </label>
                  <p className="text-[11px] text-zinc-400">
                    Определяет, как вычисляется длительность заказа и блокируется интервал в календаре записи:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                        (company.duration_calculation_mode || 'max') === 'max'
                          ? 'border-amber-400/60 bg-amber-400/10'
                          : 'border-white/10 bg-black/30 hover:border-white/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="duration_calc_mode"
                        checked={(company.duration_calculation_mode || 'max') === 'max'}
                        onChange={() =>
                          setCompany({ ...company, duration_calculation_mode: 'max' })
                        }
                        className="mt-0.5"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-white block">По максимальной услуге (рекомендуется)</span>
                        <span className="text-[11px] text-zinc-400">
                          Мастера работают параллельно. Например: 3 ч + 1.5 ч = 3 часа занятости бокса.
                        </span>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                        company.duration_calculation_mode === 'sum'
                          ? 'border-amber-400/60 bg-amber-400/10'
                          : 'border-white/10 bg-black/30 hover:border-white/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="duration_calc_mode"
                        checked={company.duration_calculation_mode === 'sum'}
                        onChange={() =>
                          setCompany({ ...company, duration_calculation_mode: 'sum' })
                        }
                        className="mt-0.5"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-white block">Суммирование длительностей</span>
                        <span className="text-[11px] text-zinc-400">
                          Услуги выполняются последовательно: 3 ч + 1.5 ч = 4.5 часа занятости бокса.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </form>

          {/* ── Credentials & Access Card (Multi-Tenant Isolated) ─────────────── */}
          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 space-y-6 max-w-2xl mt-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400">
                  <Key size={18} weight="bold" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Учётные данные для входа студии</h3>
                  <p className="text-[11px] text-zinc-400">Логин и пароль для доступа к этой панели управления</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-400 block">Текущий логин:</span>
                <span className="font-mono text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-md">
                  {currentCompanyLogin}
                </span>
              </div>
            </div>

            {/* 1. Change Login Form */}
            <form onSubmit={handleChangeLogin} className="rounded-xl border border-white/5 bg-black/30 p-4 space-y-3 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                <User size={15} className="text-amber-400" />
                <span>Смена логина</span>
              </div>

              <div>
                <label className="block text-zinc-300 font-semibold mb-1">Новый логин:</label>
                <input
                  type="text"
                  required
                  placeholder="Введите новый логин"
                  value={newLogin}
                  onChange={(e) => setNewLogin(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-400"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Логин чувствителен к регистру и раскладке букв (например: Админ ≠ админ ≠ Admin).
                </p>
              </div>

              <div>
                <label className="block text-zinc-300 font-semibold mb-1">Текущий пароль (для подтверждения):</label>
                <input
                  type="password"
                  required
                  placeholder="Введите текущий пароль"
                  value={passwordForLoginChange}
                  onChange={(e) => setPasswordForLoginChange(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-400"
                />
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="submit"
                  disabled={changingLogin}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-black hover:bg-amber-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {changingLogin && <SpinnerGap size={14} className="animate-spin" />}
                  <span>{changingLogin ? 'Сохранение...' : 'Сменить логин'}</span>
                </button>
              </div>
            </form>

            {/* 2. Change Password Form */}
            <form onSubmit={handleChangePassword} className="rounded-xl border border-white/5 bg-black/30 p-4 space-y-3.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                <Lock size={15} className="text-amber-400" />
                <span>Смена пароля</span>
              </div>

              <div>
                <label className="block text-zinc-300 font-semibold mb-1">Текущий пароль:</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Введите текущий пароль"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-zinc-300 font-semibold">Новый пароль:</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
                    >
                      {showPassword ? <EyeSlash size={13} /> : <Eye size={13} />}
                      <span>{showPassword ? 'Скрыть' : 'Показать'}</span>
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Минимум 6 символов"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">Повторите новый пароль:</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Повторите новый пароль"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-black hover:bg-amber-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {changingPassword && <SpinnerGap size={14} className="animate-spin" />}
                  <span>{changingPassword ? 'Сохранение...' : 'Сменить пароль'}</span>
                </button>
              </div>
            </form>
          </div>
          </div>
        )}
      </main>

      {/* ── MODALS ────────────────────────────────────────────────────────── */}

      {/* 1. Manual Booking Modal */}
      {manualBookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-up">
          <div className="w-full max-w-lg rounded-3xl border border-white/20 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">Внести запись вручную</h3>
              <button
                type="button"
                onClick={() => setManualBookingModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateManualBooking} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Имя клиента:</label>
                <input
                  type="text"
                  required
                  value={manualForm.clientName}
                  onChange={(e) => setManualForm({ ...manualForm, clientName: e.target.value })}
                  placeholder="Иван"
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-zinc-400 mb-1">Телефон:</label>
                  <input
                    type="text"
                    required
                    value={manualForm.clientPhone}
                    onChange={(e) => setManualForm({ ...manualForm, clientPhone: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Автомобиль:</label>
                  <input
                    type="text"
                    required
                    placeholder="Марка Модель"
                    value={manualForm.carMake}
                    onChange={(e) => {
                      setManualForm({ ...manualForm, carMake: e.target.value, carModel: 'Авто' })
                    }}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2.5 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Услуги:</label>
                <input
                  type="text"
                  required
                  value={manualForm.serviceNames}
                  onChange={(e) => setManualForm({ ...manualForm, serviceNames: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-zinc-400 mb-1">Дата:</label>
                  <input
                    type="date"
                    required
                    value={manualForm.date}
                    onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Начало:</label>
                  <input
                    type="time"
                    required
                    value={manualForm.startTime}
                    onChange={(e) => setManualForm({ ...manualForm, startTime: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Окончание:</label>
                  <input
                    type="time"
                    required
                    value={manualForm.endTime}
                    onChange={(e) => setManualForm({ ...manualForm, endTime: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Сумма (₸):</label>
                <input
                  type="number"
                  required
                  value={manualForm.totalPrice}
                  onChange={(e) => setManualForm({ ...manualForm, totalPrice: Number(e.target.value) })}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2.5 text-white"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-amber-400 p-3 font-bold text-black hover:bg-amber-300"
                >
                  Создать подтверждённую запись
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Manual Block Modal */}
      {blockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-up">
          <div className="w-full max-w-md rounded-3xl border border-white/20 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">Блокировка времени / Закрытие дня</h3>
              <button
                type="button"
                onClick={() => setBlockModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBlock} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Дата:</label>
                <input
                  type="date"
                  required
                  value={blockForm.date}
                  onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-zinc-400 mb-1">Время с:</label>
                  <input
                    type="time"
                    required
                    value={blockForm.startTime}
                    onChange={(e) => setBlockForm({ ...blockForm, startTime: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Время по:</label>
                  <input
                    type="time"
                    required
                    value={blockForm.endTime}
                    onChange={(e) => setBlockForm({ ...blockForm, endTime: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Причина:</label>
                <input
                  type="text"
                  required
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2.5 text-white"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-amber-400 p-3 font-bold text-black hover:bg-amber-300"
                >
                  Заблокировать интервал
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Service Edit / Add Modal */}
      {serviceModalOpen && editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-up">
          <div className="w-full max-w-md rounded-3xl border border-white/20 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">Редактирование услуги</h3>
              <button
                type="button"
                onClick={() => setServiceModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSaveService(editingService)
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-zinc-400 mb-1">Название:</label>
                <input
                  type="text"
                  required
                  value={editingService.name}
                  onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Описание:</label>
                <textarea
                  rows={2}
                  value={editingService.description || ''}
                  onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-zinc-400 mb-1">Минимальная цена (₸):</label>
                  <input
                    type="number"
                    required
                    value={editingService.price_from}
                    onChange={(e) => setEditingService({ ...editingService, price_from: Number(e.target.value) })}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Длительность (минут):</label>
                  <input
                    type="number"
                    required
                    step={15}
                    value={editingService.duration_minutes}
                    onChange={(e) => setEditingService({ ...editingService, duration_minutes: Number(e.target.value) })}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 p-2.5 text-white"
                  />
                </div>
              </div>

              {/* Service image with device upload */}
              <div>
                <label className="block text-zinc-400 mb-1">Изображение услуги:</label>
                <input
                  type="file"
                  ref={serviceFileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleServiceFileUpload}
                />
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/..."
                    value={editingService.image_url || ''}
                    onChange={(e) => setEditingService({ ...editingService, image_url: e.target.value })}
                    className="flex-1 rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-white text-xs outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => serviceFileInputRef.current?.click()}
                    disabled={uploadingServicePhoto}
                    className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs text-white transition-colors"
                  >
                    {uploadingServicePhoto ? (
                      <SpinnerGap size={14} className="animate-spin" />
                    ) : (
                      <UploadSimple size={14} />
                    )}
                    <span>С устройства</span>
                  </button>
                </div>
                {editingService.image_url && (
                  <div className="mt-2 aspect-video w-32 rounded-lg overflow-hidden border border-white/10">
                    <img src={editingService.image_url} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-amber-400 p-3 font-bold text-black hover:bg-amber-300"
                >
                  Сохранить услугу
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Reschedule Booking Modal */}
      {rescheduleModalOpen && reschedulingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-up">
          <div className="w-full max-w-md rounded-3xl border border-white/20 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">Перенос записи #{reschedulingBooking.public_code}</h3>
              <button
                type="button"
                onClick={() => setRescheduleModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Клиент:</label>
                <div className="font-bold text-white text-sm">{reschedulingBooking.client_name}</div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Новая дата и время начала:</label>
                <input
                  type="datetime-local"
                  required
                  value={newRescheduleTime}
                  onChange={(e) => setNewRescheduleTime(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 p-3 text-white text-sm"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-amber-400 p-3 font-bold text-black hover:bg-amber-300"
                >
                  Подтвердить перенос
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
