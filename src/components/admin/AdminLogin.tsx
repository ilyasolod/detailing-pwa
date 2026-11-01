import React, { useState } from 'react'
import type { Company } from '../../types/database'
import { loginOwner, loginOwnerForCompany } from '../../lib/detailing-engine'
import { ShieldCheck, Lock, User, Eye, EyeSlash, SpinnerGap, WarningCircle, ArrowLeft } from '@phosphor-icons/react'

interface AdminLoginProps {
  company?: Company
  onLoginSuccess: () => void
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ company, onLoginSuccess }) => {
  const [login, setLogin] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (company) {
        await loginOwnerForCompany(company.id, login.trim(), password.trim())
      } else {
        await loginOwner(login.trim(), password.trim())
      }
      onLoginSuccess()
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось войти. Проверьте правильность логина и пароля.'
      )
    } finally {
      setLoading(false)
    }
  }

  const brandColor = company?.design_settings.primary_color || '#E5A93C'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08080A] px-4 py-12 text-zinc-100">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/90 p-8 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="text-center">
          {company?.logo_url ? (
            <img
              src={company.logo_url}
              alt=""
              className="mx-auto mb-4 h-16 w-16 rounded-2xl object-cover ring-2 ring-white/15 shadow-xl"
            />
          ) : (
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-black font-extrabold text-lg mb-4 shadow-xl"
              style={{ backgroundColor: brandColor }}
            >
              {company ? company.name.slice(0, 2).toUpperCase() : <ShieldCheck size={32} weight="fill" />}
            </div>
          )}
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            {company ? company.name : 'Кабинет владельца'}
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Вход в панель управления детейлинг-центром
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-zinc-400">
                Логин
              </label>
              <span className="text-[10px] text-zinc-500">
                Регистрозависимый
              </span>
            </div>
            <div className="relative">
              <User size={18} className="absolute left-3.5 top-3.5 text-zinc-500" />
              <input
                type="text"
                required
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Админ"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full rounded-xl border border-white/10 bg-zinc-900/90 py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              Логин чувствителен к регистру и языку (Админ ≠ админ ≠ Admin).
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Пароль
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3.5 top-3.5 text-zinc-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-white/10 bg-zinc-900/90 py-3 pl-10 pr-11 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-white transition-colors"
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-400 animate-fade-up">
              <WarningCircle size={18} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-amber-400 font-bold text-black shadow-lg transition-all hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <SpinnerGap size={18} className="animate-spin" />
                <span>Авторизация...</span>
              </>
            ) : (
              <span>Войти в панель</span>
            )}
          </button>
        </form>

        {company && (
          <div className="mt-6 pt-4 border-t border-white/10 text-center">
            <a
              href={`/c/${company.slug}`}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={14} />
              <span>На клиентскую страницу студии</span>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
