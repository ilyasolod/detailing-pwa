import React from 'react'

export const LoadingSpinner: React.FC<{ label?: string }> = ({ label = 'Загрузка...' }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400">
      <div className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin mb-3" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
