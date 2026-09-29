import type { StudioStatus } from '@/media-studio/types'
import { statusLabel } from '@/media-studio/format'

const TONE: Record<StudioStatus, string> = {
  COMPLETED: '--admin-success',
  PARTIAL: '--admin-warning',
  DOWNLOADING: '--admin-info',
  PROCESSING: '--admin-info',
  ANALYZING: '--admin-info',
  READY: '--admin-info',
  FAILED: '--admin-danger',
  CANCELLED: '--admin-muted',
  QUEUED: '--admin-muted',
  EXPIRED: '--admin-warning',
}

export function StatusBadge({ status }: { status: StudioStatus | 'ANALYZING' | 'READY' }) {
  const token = TONE[status as StudioStatus] ?? '--admin-muted'
  const label = status === 'READY' ? 'Hazır' : status === 'ANALYZING' ? 'Analiz ediliyor' : statusLabel(status)
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide"
      style={{
        color: `rgb(var(${token}))`,
        backgroundColor: `color-mix(in srgb, rgb(var(${token})) 16%, transparent)`,
      }}
    >
      {label}
    </span>
  )
}
