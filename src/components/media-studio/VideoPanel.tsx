'use client'

import { useState } from 'react'
import type { WorkspaceVideo } from '@/media-studio/types'
import { fieldClass, ghostButton, quietButton } from './styles'

export function VideoPanel({
  video,
  hue,
  onRename,
  onDelete,
  onDownload,
}: {
  video: WorkspaceVideo | null
  hue: number
  onRename: (filename: string) => void
  onDelete: () => void
  onDownload: () => void
}) {
  const [name, setName] = useState(video?.filename ?? '')
  const [editing, setEditing] = useState(false)
  if (!video) {
    return (
      <div className="rounded-3xl border border-dashed border-[rgb(var(--color-border))] px-6 py-16 text-center">
        <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">Bu içerikte video yok.</h3>
        <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">Görseller ve metin diğer sekmelerde duruyor.</p>
      </div>
    )
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <div
        className="relative flex aspect-video items-center justify-center"
        style={{
          backgroundImage: `linear-gradient(160deg, hsl(${hue} 36% 28%), hsl(${(hue + 24) % 360} 30% 10%))`,
        }}
      >
        <button
          type="button"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgb(var(--color-card))] text-lg font-semibold text-[rgb(var(--color-text))]"
          aria-label="Videoyu oynat"
          onClick={onDownload}
        >
          ▶
        </button>
        <p className="absolute bottom-4 left-4 text-xs text-white/80">Önizleme alanı</p>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <Meta label="Dosya" value={video.filename} />
        <Meta label="Çözünürlük" value={video.resolution} />
        <Meta label="Süre" value={video.duration} />
        <Meta label="Biçim" value={video.format} />
        <Meta label="Boyut" value={video.sizeLabel} />
      </div>
      <div className="flex flex-wrap gap-2 border-t border-[rgb(var(--color-border))] px-4 py-3">
        <button type="button" className={quietButton} onClick={onDownload}>
          İndir
        </button>
        <button type="button" className={quietButton} onClick={() => setEditing((value) => !value)}>
          Yeniden Adlandır
        </button>
        <button type="button" className={ghostButton} onClick={onDelete}>
          Sil
        </button>
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-2 border-t border-[rgb(var(--color-border))] px-4 py-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            onRename(name)
            setEditing(false)
          }}
        >
          <label className="sr-only" htmlFor="video-rename">
            Yeni dosya adı
          </label>
          <input id="video-rename" className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} />
          <button type="submit" className={quietButton}>
            Kaydet
          </button>
        </form>
      ) : null}
    </section>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[rgb(var(--color-muted))]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[rgb(var(--color-text))]">{value}</p>
    </div>
  )
}
