import React, { useState } from 'react'
import type { GalleryPhoto } from '../../types/database'
import { Eye, X } from '@phosphor-icons/react'

interface PortfolioBlockProps {
  photos: GalleryPhoto[]
  brandColor?: string
}

export const PortfolioBlock: React.FC<PortfolioBlockProps> = ({ photos, brandColor = '#E5A93C' }) => {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)

  if (!photos || photos.length === 0) return null

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-white/10 pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Качество и эстетика
          </span>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Портфолио выполненных работ
          </h2>
        </div>
        <p className="text-xs text-zinc-400">
          Нажмите на фотографию для детального просмотра
        </p>
      </div>

      {/* Grid of photos */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {photos.map((photo, index) => (
          <div
            key={photo.id || index}
            onClick={() => setSelectedPhoto(photo.image_url)}
            className="group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-md transition-all duration-300 hover:border-white/30 hover:shadow-xl"
          >
            <img
              src={photo.image_url}
              alt="Детейлинг работа"
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-center justify-center">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-black shadow-lg"
                style={{ backgroundColor: brandColor }}
              >
                <Eye size={20} weight="bold" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фотографии работы"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-up"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-6 right-6 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white transition-colors hover:bg-white hover:text-black"
            aria-label="Закрыть просмотр"
          >
            <X size={22} weight="bold" />
          </button>
          <img
            src={selectedPhoto}
            alt="Увеличенное фото работы"
            className="max-h-[85vh] max-w-full rounded-2xl border border-white/20 object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </section>
  )
}
