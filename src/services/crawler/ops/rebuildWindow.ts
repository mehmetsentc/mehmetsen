import { shouldSkipStaleDiscovery } from '../freshness'
import { isRebuildFreshnessActive, type CrawlerOpsState } from './opsState'

export const REBUILD_WINDOW_HOURS = 24

export function rebuildCutoffAt(now = new Date(), hours = REBUILD_WINDOW_HOURS): Date {
  return new Date(now.getTime() - hours * 3600_000)
}

export function isInRecentRebuildWindow(opts: {
  publishedAt: Date | null | undefined
  discoveredAt?: Date | null
  cutoffAt: Date
  now?: Date
}): { include: boolean; provenance: 'published_at' | 'discovery_time' | 'excluded' } {
  if (opts.publishedAt && Number.isFinite(opts.publishedAt.getTime())) {
    return opts.publishedAt.getTime() >= opts.cutoffAt.getTime()
      ? { include: true, provenance: 'published_at' }
      : { include: false, provenance: 'excluded' }
  }
  const discovered = opts.discoveredAt || opts.now
  if (discovered && Number.isFinite(discovered.getTime()) && discovered.getTime() >= opts.cutoffAt.getTime()) {
    return { include: true, provenance: 'discovery_time' }
  }
  return { include: false, provenance: 'excluded' }
}

export function shouldSkipOutsideRebuildWindow(opts: {
  publishedAt: Date | null | undefined
  discoveredAt?: Date | null
  ops: CrawlerOpsState | null | undefined
  now?: Date
}): boolean {
  if (!opts.ops || !isRebuildFreshnessActive(opts.ops) || !opts.ops.cutoffAt) return false
  return !isInRecentRebuildWindow({
    publishedAt: opts.publishedAt,
    discoveredAt: opts.discoveredAt,
    cutoffAt: opts.ops.cutoffAt,
    now: opts.now,
  }).include
}

export function shouldSkipStaleOrRebuild(opts: {
  publishedAt: Date | null | undefined
  freshnessHours: number
  discoveryMethod: string
  ops?: CrawlerOpsState | null
  now?: Date
}): boolean {
  if (
    shouldSkipStaleDiscovery({
      publishedAt: opts.publishedAt,
      freshnessHours: opts.freshnessHours,
      discoveryMethod: opts.discoveryMethod,
      now: opts.now,
    })
  ) {
    return true
  }
  return shouldSkipOutsideRebuildWindow({
    publishedAt: opts.publishedAt,
    discoveredAt: opts.now,
    ops: opts.ops,
    now: opts.now,
  })
}
