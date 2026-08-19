import type { CrawlerStore } from '../store/types'
import { previewProtectedCleanup } from './cleanupExecute'
import type { CleanupPlan } from './protectedSet'

export interface CleanupDryRunReport {
  dryRun: true
  executed: false
  rawToDelete: number
  clustersAffected: number
  mediaRelations: number
  publishedPreserved: number
  cmsNewsPreserved: number
  auditPreserved: number
  skippedStatuses: Record<string, number>
  notes: string[]
  plan?: CleanupPlan
}

export async function previewBacklogCleanup(store: CrawlerStore): Promise<CleanupDryRunReport> {
  const plan = await previewProtectedCleanup(store)
  return {
    dryRun: true,
    executed: false,
    rawToDelete: plan.rawEligible,
    clustersAffected: plan.clusterEligible,
    mediaRelations: plan.mediaEligible,
    publishedPreserved: plan.protectedPublishedRaw,
    cmsNewsPreserved: plan.protectedEditorialLinkedRaw,
    auditPreserved: plan.auditRows,
    skippedStatuses: { PUBLISHED: plan.protectedPublishedRaw },
    notes: plan.notes,
    plan,
  }
}

export interface RescrapePlan {
  windowHours: 24
  sources: 'ACTIVE'
  aiRequests: 0
  publish: 0
  executed: boolean
  notes: string[]
}

export function describeRescrapePlan(): RescrapePlan {
  return {
    windowHours: 24,
    sources: 'ACTIVE',
    aiRequests: 0,
    publish: 0,
    executed: false,
    notes: [
      'Rebuild last 24h from ACTIVE sources only after protected cleanup.',
      'AI dispatch remains closed (0 provider calls).',
      'Auto-publish remains closed.',
    ],
  }
}
