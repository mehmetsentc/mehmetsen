'use client'

import { useEffect, useRef } from 'react'
import type { StudioImage } from '@/media-studio/types'
import { stepIndex } from '@/media-studio/format'
import { focusRing, quietButton } from './styles'
import { MediaThumb } from './MediaThumb'

export function ImageLightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: StudioImage[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const image = images[index]
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previous = document.activeElement as HTMLElement | null
    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')).filter(
        (node) => !node.hasAttribute('disabled')
      )
    focusable()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onIndex(stepIndex(index, images.length, 1))
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onIndex(stepIndex(index, images.length, -1))
        return
      }
      if (event.key !== 'Tab') return
      const nodes = focusable()
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [images.length, index, onClose, onIndex])

  if (!image) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={image.filename}
        className="grid max-h-[92vh] w-full max-w-5xl gap-4 overflow-auto rounded-3xl bg-[rgb(var(--color-card))] p-4 lg:grid-cols-[minmax(0,1fr)_240px]"
        onClick={(event) => event.stopPropagation()}
      >
        <MediaThumb hue={image.hue} src={image.publicUrl} className="min-h-[240px] rounded-2xl" label={image.filename} />
        <div>
          <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">{image.filename}</h3>
          <dl className="mt-4 space-y-2 text-sm text-[rgb(var(--color-muted))]">
            <div>
              <dt>Boyutlar</dt>
              <dd className="text-[rgb(var(--color-text))]">
                {image.width}×{image.height}
              </dd>
            </div>
            <div>
              <dt>Biçim</dt>
              <dd className="text-[rgb(var(--color-text))]">{image.format}</dd>
            </div>
            <div>
              <dt>Dosya</dt>
              <dd className="text-[rgb(var(--color-text))]">{image.sizeLabel}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" className={quietButton} onClick={() => onIndex(stepIndex(index, images.length, -1))}>
              Önceki
            </button>
            <button type="button" className={quietButton} onClick={() => onIndex(stepIndex(index, images.length, 1))}>
              Sonraki
            </button>
            <button type="button" className={`${quietButton} ${focusRing}`} onClick={onClose}>
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
