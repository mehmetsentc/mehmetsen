export type CrawlerMaintenanceMode = 'IDLE' | 'MAINTENANCE' | 'REBUILD'
export type RebuildStatus =
  | 'IDLE'
  | 'PREPARING'
  | 'CLEANING'
  | 'REDISCOVERING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'ERROR'

export interface CrawlerOpsState {
  id: 'global'
  maintenanceMode: CrawlerMaintenanceMode
  rebuildStatus: RebuildStatus
  rebuildWindowHours: number
  cutoffAt: Date | null
  rebuildStartedAt: Date | null
  rebuildFinishedAt: Date | null
  planHash: string | null
  lastError: string | null
  discovered: number
  pending: number
  extracted: number
  failed: number
  events: number
  multiSource: number
  updatedAt: Date
}

export const REBUILD_STATUS_TR: Record<RebuildStatus, string> = {
  IDLE: 'Beklemede',
  PREPARING: 'Hazırlanıyor',
  CLEANING: 'Temizleniyor',
  REDISCOVERING: 'Yeniden Keşfediliyor',
  PROCESSING: 'İşleniyor',
  COMPLETED: 'Tamamlandı',
  ERROR: 'Hata',
}

export function defaultOpsState(): CrawlerOpsState {
  return {
    id: 'global',
    maintenanceMode: 'IDLE',
    rebuildStatus: 'IDLE',
    rebuildWindowHours: 24,
    cutoffAt: null,
    rebuildStartedAt: null,
    rebuildFinishedAt: null,
    planHash: null,
    lastError: null,
    discovered: 0,
    pending: 0,
    extracted: 0,
    failed: 0,
    events: 0,
    multiSource: 0,
    updatedAt: new Date(0),
  }
}

export function isMaintenanceLock(ops: CrawlerOpsState | null | undefined): boolean {
  return ops?.maintenanceMode === 'MAINTENANCE'
}

export function isRebuildFreshnessActive(ops: CrawlerOpsState | null | undefined): boolean {
  if (!ops) return false
  return (
    ops.rebuildStatus === 'REDISCOVERING' ||
    ops.rebuildStatus === 'PROCESSING' ||
    ops.rebuildStatus === 'PREPARING' ||
    ops.rebuildStatus === 'CLEANING'
  )
}

export function effectiveFreshnessHours(sourceHours: number, ops: CrawlerOpsState | null | undefined): number {
  const base = Number.isFinite(sourceHours) && sourceHours > 0 ? sourceHours : 48
  if (isRebuildFreshnessActive(ops)) {
    return Math.min(base, ops?.rebuildWindowHours || 24)
  }
  return base
}

export function opsStateFromUnknown(store: unknown): CrawlerOpsState | null {
  if (store && typeof store === 'object' && 'opsState' in store) {
    const value = (store as { opsState?: CrawlerOpsState }).opsState
    return value || null
  }
  return null
}

export function patchMemoryOps(store: unknown, patch: Partial<CrawlerOpsState>): CrawlerOpsState {
  const current = opsStateFromUnknown(store) || defaultOpsState()
  const next = { ...current, ...patch, updatedAt: new Date() }
  if (store && typeof store === 'object') {
    ;(store as { opsState: CrawlerOpsState }).opsState = next
  }
  return next
}
