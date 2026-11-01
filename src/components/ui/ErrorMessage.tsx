import React from 'react'
import { WarningCircle } from '@phosphor-icons/react'

interface ErrorMessageProps {
  message: string
  onRetry?: () => void
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-rose-900/40 bg-rose-950/20 text-rose-300">
      <WarningCircle size={36} className="text-rose-500 mb-2" weight="duotone" />
      <p className="text-sm font-medium">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 transition-colors cursor-pointer"
        >
          Повторить попытку
        </button>
      )}
    </div>
  )
}
