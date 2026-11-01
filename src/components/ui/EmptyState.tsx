import React from 'react'
import { Tray } from '@phosphor-icons/react'

interface EmptyStateProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-zinc-800/80 bg-zinc-900/30">
      <Tray size={44} className="text-zinc-600 mb-3" weight="light" />
      <h3 className="text-base font-medium text-zinc-200">{title}</h3>
      {description && <p className="text-sm text-zinc-500 mt-1 max-w-xs">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-xl text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
