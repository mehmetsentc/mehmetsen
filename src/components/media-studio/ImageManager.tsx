'use client'

import { useState } from 'react'
import type { StudioImage } from '@/media-studio/types'
import { imageGridClass } from '@/media-studio/layoutContract'
import { fieldClass, focusRing, ghostButton, quietButton } from './styles'
import { MediaThumb } from './MediaThumb'
import { ImageLightbox } from './ImageLightbox'

const chipButton = `inline-flex min-h-8 items-center justify-center rounded-md px-1 text-[11px] font-medium leading-none text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))] ${focusRing}`

export function ImageManager({
  images,
  selectedIds,
  onToggle,
  onClear,
  onDeleteSelected,
  onDownloadSelected,
  onRename,
  onCover,
  onDownloadOne,
  onDeleteOne,
}: {
  images: StudioImage[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onClear: () => void
  onDeleteSelected: () => void
  onDownloadSelected: () => void
  onRename: (id: string, filename: string) => void
  onCover: (id: string) => void
  onDownloadOne: (id: string) => void
  onDeleteOne: (id: string) => void
}) {
  const [open, setOpen] = useState<number | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  if (images.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[rgb(var(--color-border))] px-6 py-16 text-center">
        <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">Görsel yok.</h3>
      </div>
    )
  }

  return (
    <div>
      {selectedIds.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3">
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{selectedIds.length} görsel seçildi</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={quietButton} onClick={onDownloadSelected}>
              İndir
            </button>
            <button type="button" className={quietButton} onClick={onDeleteSelected}>
              Sil
            </button>
            <button type="button" className={ghostButton} onClick={onClear}>
              Seçimi Temizle
            </button>
          </div>
        </div>
      ) : null}
      <div className={imageGridClass}>
        {images.map((image, index) => {
          const selected = selectedIds.includes(image.id)
          return (
            <article
              key={image.id}
              className={`overflow-hidden rounded-2xl border bg-[rgb(var(--color-card))] ${
                selected ? 'border-[rgb(var(--color-brand))]' : 'border-[rgb(var(--color-border))]'
              }`}
            >
              <button type="button" className={`block w-full ${focusRing}`} onClick={() => setOpen(index)} aria-label={`${image.filename} büyüt`}>
                <MediaThumb hue={image.hue} className="aspect-[4/3]" label="" />
              </button>
              <div className="space-y-2 p-3">
                <div>
                  <p className="truncate text-sm font-medium text-[rgb(var(--color-text))]">{image.filename}</p>
                  <p className="text-xs text-[rgb(var(--color-muted))]">
                    {image.width}×{image.height} · {image.sizeLabel}
                    {image.cover ? ' · Kapak' : ''}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button type="button" className={chipButton} onClick={() => onToggle(image.id)}>
                    {selected ? 'Kaldır' : 'Seç'}
                  </button>
                  <button type="button" className={chipButton} onClick={() => setOpen(index)}>
                    Büyüt
                  </button>
                  <button type="button" className={chipButton} onClick={() => onDownloadOne(image.id)}>
                    İndir
                  </button>
                  <button
                    type="button"
                    className={chipButton}
                    title="Yeniden Adlandır"
                    aria-label={`${image.filename} dosyasını yeniden adlandır`}
                    onClick={() => {
                      setRenameId(image.id)
                      setRenameValue(image.filename)
                    }}
                  >
                    Adlandır
                  </button>
                  <button type="button" className={chipButton} title="Kapak Yap" aria-label={`${image.filename} görselini kapak yap`} onClick={() => onCover(image.id)}>
                    Kapak
                  </button>
                  <button
                    type="button"
                    className={`${chipButton} text-[rgb(var(--admin-danger))]`}
                    aria-label={`${image.filename} görselini sil`}
                    onClick={() => onDeleteOne(image.id)}
                  >
                    Sil
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
      {renameId ? (
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            onRename(renameId, renameValue)
            setRenameId(null)
          }}
        >
          <label className="sr-only" htmlFor="image-rename">
            Yeni görsel adı
          </label>
          <input
            id="image-rename"
            className={fieldClass}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
          />
          <button type="submit" className={quietButton}>
            Kaydet
          </button>
        </form>
      ) : null}
      {open !== null ? (
        <ImageLightbox
          images={images}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  )
}
