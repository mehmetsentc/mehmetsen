import type { StudioStatus } from './types'

const STATUS_LABEL: Record<StudioStatus, string> = {
  QUEUED: 'Bekliyor',
  ANALYZING: 'Analiz ediliyor',
  READY: 'Hazır',
  DOWNLOADING: 'İndiriliyor',
  PROCESSING: 'İşleniyor',
  COMPLETED: 'Tamamlandı',
  PARTIAL: 'Kısmen hazır',
  FAILED: 'Başarısız',
  CANCELLED: 'İptal edildi',
  EXPIRED: 'Süresi doldu',
}

export function statusLabel(status: StudioStatus): string {
  return STATUS_LABEL[status]
}

export function statusCounts(statuses: StudioStatus[]): {
  active: number
  queued: number
  completed: number
  failed: number
} {
  let active = 0
  let queued = 0
  let completed = 0
  let failed = 0
  for (const status of statuses) {
    if (status === 'DOWNLOADING' || status === 'PROCESSING' || status === 'ANALYZING') active += 1
    else if (status === 'QUEUED') queued += 1
    else if (status === 'COMPLETED' || status === 'PARTIAL') completed += 1
    else if (status === 'FAILED') failed += 1
  }
  return { active, queued, completed, failed }
}

export function stepIndex(index: number, length: number, delta: number): number {
  if (length <= 0) return 0
  return (index + delta + length) % length
}

export function progressSpeedLabel(speed: string): string {
  return speed.replace(/MB\/s\b/g, 'MB/sn')
}

export function progressEtaLabel(eta: string): string {
  const match = eta.match(/^00:(\d{2}) kaldı$/)
  if (!match) return eta
  return `yaklaşık ${Number(match[1])} sn kaldı`
}

export function progressEtaShort(eta: string): string {
  return progressEtaLabel(eta).replace(/^yaklaşık\s+/, '')
}

/** "124 MB" + "182 MB" → "124 / 182 MB". Mock labels only. */
export function progressAmountLabel(loaded: string, total: string): string {
  const unit = total.match(/(KB|MB|GB)$/)?.[1]
  if (unit && loaded.endsWith(` ${unit}`)) return `${loaded.slice(0, -(unit.length + 1))} / ${total}`
  if (!loaded) return total
  return `${loaded} / ${total}`
}

/** Completed share of a mock batch. In-progress rows keep their own percents. */
export function batchOverview(jobs: { status: string }[]): {
  total: number
  completed: number
  active: number
  queued: number
  failed: number
  percent: number
} {
  let completed = 0
  let active = 0
  let queued = 0
  let failed = 0
  for (const job of jobs) {
    if (job.status === 'COMPLETED' || job.status === 'PARTIAL') completed += 1
    else if (job.status === 'DOWNLOADING' || job.status === 'PROCESSING' || job.status === 'ANALYZING') active += 1
    else if (job.status === 'QUEUED') queued += 1
    else if (job.status === 'FAILED') failed += 1
  }
  const total = jobs.length
  return {
    total,
    completed,
    active,
    queued,
    failed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  }
}
