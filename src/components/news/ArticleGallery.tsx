'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import type { MediaItem } from '@/types/post'

interface ArticleGalleryProps {
  items: MediaItem[]
  title: string
  columns?: 2 | 3
}

export function ArticleGallery({ items, title, columns = 2 }: ArticleGalleryProps) {
  const images = items.filter((m) => m.type === 'image' && m.url?.trim())
  const [active, setActive] = useState<number | null>(null)

  const close = useCallback(() => setActive(null), [])
  const prev = useCallback(() => {
    setActive((i) => (i == null ? i : (i - 1 + images.length) % images.length))
  }, [images.length])
  const next = useCallback(() => {
    setActive((i) => (i == null ? i : (i + 1) % images.length))
  }, [images.length])

  useEffect(() => {
    if (active == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [active, close, prev, next])

  if (images.length === 0) return null

  const current = active != null ? images[active] : null

  return (
    <>
      <section
        aria-label="Galeri"
        className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${columns === 3 ? 'lg:grid-cols-3' : ''}`}
      >
        {images.map((item, i) => (
          <button
            key={`${item.url}-${i}`}
            type="button"
            onClick={() => setActive(i)}
            className="group relative aspect-[16/10] overflow-hidden rounded-xl bg-[rgb(var(--color-border))] text-left"
            aria-label={`Galeriyi aç: ${item.caption || title}`}
          >
            <SafeNewsImage
              src={item.url}
              alt={item.alt || item.caption || title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes={columns === 3 ? '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw' : '(max-width: 640px) 100vw, 50vw'}
            />
            {item.caption ? (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-xs text-white">
                {item.caption}
              </span>
            ) : null}
          </button>
        ))}
      </section>

      {current && active != null ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Galeri görüntüleyici"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-out"
            onClick={close}
            aria-label="Kapat"
          />
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={prev}
                className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-6"
                aria-label="Önceki"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6"
                aria-label="Sonraki"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}
          <div className="relative z-[1] max-h-[85vh] w-full max-w-4xl">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl">
              <SafeNewsImage
                src={current.url}
                alt={current.alt || current.caption || title}
                fill
                className="object-contain"
                sizes="100vw"
                priority
              />
            </div>
            <p className="mt-3 text-center text-sm text-white/80">
              {current.caption || `${active + 1} / ${images.length}`}
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}
