'use client'

import { useState } from 'react'
import type { Workspace } from '@/media-studio/types'
import { primaryButton } from './styles'
import { MediaThumb } from './MediaThumb'
import { OverflowMenu, overflowItemClass } from './OverflowMenu'
import { RetentionBadge } from './RetentionBadge'
import { StatusBadge } from './StatusBadge'

export function WorkspaceHeader({
  workspace,
  onEdit,
  onDownloadAll,
  onZip,
  onHandoff,
  onDelete,
  onKeep,
}: {
  workspace: Workspace
  onEdit: () => void
  onDownloadAll: () => void
  onZip: () => void
  onHandoff: () => void
  onDelete: () => void
  onKeep: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <header className="grid items-start gap-5 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
      <MediaThumb
        hue={workspace.thumbHue}
        src={workspace.images.find((image) => image.cover)?.publicUrl ?? workspace.images[0]?.publicUrl}
        className="aspect-video w-full rounded-2xl"
        label=""
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={workspace.status} />
          <RetentionBadge retention={workspace.retention} />
        </div>
        <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-[rgb(var(--color-text))]">{workspace.title}</h2>
        <p className="mt-2 truncate text-sm text-[rgb(var(--color-text))]/80">
          {workspace.source} · {workspace.importedLabel} · {workspace.sizeLabel}
        </p>
        <p className="mt-1 truncate text-sm text-[rgb(var(--color-muted))]">{workspace.originalUrl}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" className={primaryButton} onClick={onEdit}>
            Düzenle
          </button>
          <OverflowMenu label="Çalışma alanı işlemleri">
            <button type="button" className={overflowItemClass} onClick={onDownloadAll}>
              Tümünü indir
            </button>
            <button type="button" className={overflowItemClass} onClick={onZip}>
              ZIP
            </button>
            <button type="button" className={overflowItemClass} onClick={onHandoff}>
              NaHaber&apos;e aktar
            </button>
            {workspace.retention.mode === 'temporary' ? (
              <button type="button" className={overflowItemClass} onClick={onKeep}>
                Sakla
              </button>
            ) : null}
            {confirm ? (
              <button type="button" className={`${overflowItemClass} text-[rgb(var(--admin-danger))]`} onClick={onDelete}>
                Silmeyi onayla
              </button>
            ) : (
              <button
                type="button"
                className={overflowItemClass}
                onClick={(event) => {
                  event.stopPropagation()
                  setConfirm(true)
                }}
              >
                Sil
              </button>
            )}
          </OverflowMenu>
        </div>
      </div>
    </header>
  )
}
