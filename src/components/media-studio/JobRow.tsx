'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import type { StudioJob } from '@/media-studio/types'
import { progressAmountLabel, progressEtaShort, progressSpeedLabel } from '@/media-studio/format'
import { primaryButton } from './styles'
import { MediaThumb } from './MediaThumb'
import { OverflowMenu, overflowItemClass } from './OverflowMenu'
import { StatusBadge } from './StatusBadge'
import { useStudioLinks } from './studioLinks'

export function JobRow({
  job,
  onCancel,
  onRetry,
  onDelete,
  onDownload,
}: {
  job: StudioJob
  onCancel: () => void
  onRetry: () => void
  onDelete: () => void
  onDownload: () => void
  prominent?: boolean
}) {
  const [confirm, setConfirm] = useState(false)
  const links = useStudioLinks()
  const canCancel = job.status === 'DOWNLOADING' || job.status === 'QUEUED' || job.status === 'PROCESSING'
  const canRetry = job.status === 'FAILED' || job.status === 'CANCELLED'
  const progress = job.progress
  const downloading = job.status === 'DOWNLOADING' && progress
  const completed = job.status === 'COMPLETED'

  if (downloading) {
    const width = progress.percent == null ? null : Math.max(0, Math.min(100, progress.percent))
    const speed = progressSpeedLabel(progress.speedLabel)
    const eta = progress.etaLabel ? progressEtaShort(progress.etaLabel) : ''
    return (
      <article className="rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[rgb(var(--color-border))] sm:p-4">
        <div className="flex gap-3 sm:gap-4">
          <MediaThumb hue={job.thumbHue} src={job.thumbUrl} className="h-16 w-24 shrink-0 rounded-xl sm:h-[104px] sm:w-[176px]" label="" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-[rgb(var(--color-text))]">{job.title}</h3>
                <p className="mt-1 hidden text-sm text-[rgb(var(--color-text))]/80 sm:block">{job.mediaLabel ?? job.stageLabel ?? 'Video'}</p>
              </div>
              <div className="flex items-start gap-1">
                {width == null ? null : (
                <p className="text-[28px] font-semibold leading-none tabular-nums tracking-tight text-[rgb(var(--color-text))] sm:text-[32px]">
                  {width}%
                </p>
                )}
                <OverflowMenu label={`${job.title} işlemleri`}>
                  <button type="button" className={overflowItemClass} onClick={onCancel}>
                    İptal
                  </button>
                </OverflowMenu>
              </div>
            </div>
            <ProgressBlock className="mt-3 hidden sm:block" width={width} label={job.stageLabel ?? 'İndirme'} speed={speed} eta={eta} amount={progressAmountLabel(progress.loadedLabel, progress.totalLabel)} />
          </div>
        </div>
        <ProgressBlock className="mt-3 sm:hidden" width={width} label={job.stageLabel ?? 'İndirme'} speed={speed} eta={eta} amount={progressAmountLabel(progress.loadedLabel, progress.totalLabel)} />
      </article>
    )
  }

  return (
    <article className="flex items-center gap-3 py-3">
      <MediaThumb hue={job.thumbHue} className="h-12 w-16 shrink-0 rounded-lg sm:h-14 sm:w-24" label="" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-[rgb(var(--color-text))]">{job.title}</h3>
        <p className="mt-0.5 truncate text-sm text-[rgb(var(--color-text))]/75">
          {completed ? (
            <span className="inline-flex items-center gap-1 font-medium text-[rgb(var(--admin-success))]">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {job.resultLabel ?? 'İndirme tamamlandı'}
            </span>
          ) : (
            job.stageLabel ?? job.errorTitle ?? job.source
          )}
        </p>
      </div>
      {completed && job.workspaceId ? (
        <Link href={links.workspace(job.workspaceId)} className={`${primaryButton} hidden min-h-9 px-3 sm:inline-flex`}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Düzenle
        </Link>
      ) : (
        <StatusBadge status={job.status} />
      )}
      <OverflowMenu label={`${job.title} işlemleri`}>
        {completed && job.workspaceId ? (
          <Link href={links.workspace(job.workspaceId)} className={`${overflowItemClass} sm:hidden`}>
            Düzenle
          </Link>
        ) : null}
        {job.workspaceId ? (
          <Link href={links.files(job.workspaceId)} className={overflowItemClass}>
            Dosyaları Gör
          </Link>
        ) : null}
        {completed ? (
          <button type="button" className={overflowItemClass} onClick={onDownload}>
            İndir
          </button>
        ) : null}
        {canCancel ? (
          <button type="button" className={overflowItemClass} onClick={onCancel}>
            İptal
          </button>
        ) : null}
        {canRetry ? (
          <button type="button" className={overflowItemClass} onClick={onRetry}>
            Tekrar Dene
          </button>
        ) : null}
        {confirm ? (
          <button type="button" className={`${overflowItemClass} text-[rgb(var(--admin-danger))]`} onClick={onDelete}>
            Silmeyi onayla
          </button>
        ) : (
          <button type="button" className={overflowItemClass} onClick={(event) => {
            event.stopPropagation()
            setConfirm(true)
          }}>
            Sil
          </button>
        )}
      </OverflowMenu>
    </article>
  )
}

function ProgressBlock({
  className,
  width,
  label,
  amount,
  speed,
  eta,
}: {
  className?: string
  width: number | null
  label: string
  amount: string
  speed: string
  eta: string
}) {
  return (
    <div className={className}>
      <div
        className="h-2 overflow-hidden rounded-full bg-[rgb(var(--color-surface))]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width ?? undefined}
        aria-label={label}
      >
        {width == null ? null : (
          <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: 'rgb(var(--admin-info))' }} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="font-medium tabular-nums text-[rgb(var(--color-text))]">{amount}</span>
        {speed ? <span className="tabular-nums text-[rgb(var(--color-text))]/80">{speed}</span> : null}
        {eta ? <span className="tabular-nums text-[rgb(var(--color-text))]/80">{eta}</span> : null}
      </div>
    </div>
  )
}

export const JobCard = JobRow
