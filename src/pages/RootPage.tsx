import React from 'react'
import { ShieldCheck, ArrowRight, Car, Lock } from '@phosphor-icons/react'

export const RootPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#08080A] text-zinc-100 flex flex-col items-center justify-center p-4 selection:bg-amber-400 selection:text-black">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Brand Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/20 shadow-2xl">
          <Car size={36} weight="duotone" />
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Detailing PWA Platform
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
            Автономная платформа онлайн-записи и управления для независимых детейлинг-центров.
          </p>
        </div>

        {/* Notice about direct slug links */}
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 text-xs text-zinc-400 space-y-2 text-left">
          <div className="flex items-center gap-2 font-semibold text-zinc-300">
            <ShieldCheck size={16} className="text-amber-400" />
            <span>Прямой клиентский доступ</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Сайт каждого детейлинг-центра открывается по индивидуальной ссылке студии:
          </p>
          <div className="font-mono text-zinc-300 bg-black/40 p-2 rounded-lg text-[11px]">
            example.app/c/<span className="text-amber-400">:slug</span>
          </div>
        </div>

        {/* Demo Fast-links for review / evaluation */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4 text-left space-y-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Демонстрационные студии:
          </span>
          <div className="space-y-1.5 text-xs">
            <a
              href="/c/detail-lab"
              className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-zinc-900/50 hover:bg-zinc-800 transition-colors group"
            >
              <div>
                <strong className="text-white group-hover:text-amber-400">Detail Lab</strong>
                <span className="text-zinc-400 text-[11px] ml-2">(Алматы • Dark Studio)</span>
              </div>
              <ArrowRight size={14} className="text-zinc-400 group-hover:translate-x-1 transition-transform" />
            </a>

            <a
              href="/c/auto-studio"
              className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-zinc-900/50 hover:bg-zinc-800 transition-colors group"
            >
              <div>
                <strong className="text-white group-hover:text-blue-400">Auto Studio</strong>
                <span className="text-zinc-400 text-[11px] ml-2">(Астана • Clean Automotive)</span>
              </div>
              <ArrowRight size={14} className="text-zinc-400 group-hover:translate-x-1 transition-transform" />
            </a>

            <a
              href="/c/prime-detailing"
              className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-zinc-900/50 hover:bg-zinc-800 transition-colors group"
            >
              <div>
                <strong className="text-white group-hover:text-red-400">Prime Detailing</strong>
                <span className="text-zinc-400 text-[11px] ml-2">(Шымкент • Performance)</span>
              </div>
              <ArrowRight size={14} className="text-zinc-400 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>

        {/* Admin Login Link */}
        <div className="pt-2">
          <a
            href="/admin"
            className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 px-5 font-bold text-xs text-white transition-colors"
          >
            <Lock size={16} />
            <span>Вход в панель управления владельца (/admin)</span>
          </a>
        </div>
      </div>
    </div>
  )
}
