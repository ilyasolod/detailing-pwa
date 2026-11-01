import React from 'react'
import { House, Wrench, CalendarCheck } from '@phosphor-icons/react'

export type NavTab = 'home' | 'services' | 'my-booking'

interface LiquidNavProps {
  activeTab: NavTab
  onTabChange: (tab: NavTab) => void
  accentColor?: string
}

const tabs: { id: NavTab; label: string; Icon: typeof House }[] = [
  { id: 'home',       label: 'Главная',  Icon: House },
  { id: 'services',   label: 'Услуги',   Icon: Wrench },
  { id: 'my-booking', label: 'Запись',   Icon: CalendarCheck },
]

export const LiquidNav: React.FC<LiquidNavProps> = ({
  activeTab,
  onTabChange,
  accentColor: _accentColor,
}) => {
  return (
    <nav
      className="glass-nav fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-xs rounded-2xl px-1 py-1.5"
      aria-label="Навигация"
    >
      <div className="flex items-center justify-around">
        {tabs.map(({ id, label, Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className="flex flex-col items-center justify-center gap-0.5 px-5 py-2 rounded-xl cursor-pointer transition-all duration-200 min-w-0"
              style={{
                background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
                color: active ? '#ffffff' : 'rgba(255,255,255,0.4)',
              }}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} weight={active ? 'fill' : 'regular'} />
              <span className="text-[10px] font-semibold tracking-wide leading-none mt-0.5">{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
