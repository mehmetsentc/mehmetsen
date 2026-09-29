'use client'

import { primaryButton, quietButton } from './styles'

export function BulkActionBar({
  count,
  onSelectAll,
  onClear,
  onDownload,
}: {
  count: number
  onSelectAll: () => void
  onClear: () => void
  onDownload: () => void
}) {
  if (count <= 0) return null
  return (
    <div className="sticky top-3 z-20">
      <div className="flex flex-col gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{count} içerik seçildi</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${quietButton} min-h-10`} onClick={onSelectAll}>
            Tümünü Seç
          </button>
          <button type="button" className={`${quietButton} min-h-10`} onClick={onClear}>
            Seçimi Temizle
          </button>
          <button type="button" className={`${primaryButton} min-h-10`} onClick={onDownload}>
            Seçilenleri İndir
          </button>
        </div>
      </div>
    </div>
  )
}
