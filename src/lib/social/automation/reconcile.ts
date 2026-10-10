/**
 * Bounded reconciliation: turn newly published news into automation jobs.
 *
 * Why a cursor instead of publish hooks: news reaches `published` through many
 * paths (CMS approve, queue approve, AI publish, publisher, AFAD, …). A single
 * cursor over `publishedAt` covers all of them the same way, survives a missed
 * hook, and costs nothing when no rule is enabled.
 *
 *   - Runs only when at least one rule is enabled.
 *   - Reads only news with  cursor < publishedAt <= now − LAG  (single-field
 *     index, ascending, ≤ PAGE × MAX_PAGES docs per tick). The lag lets slow
 *     writers commit before the cursor passes them.
 *   - The cursor never goes below the earliest `enabledAt` (no backfill) and
 *     restarts from there after a long idle period.
 *   - Featured re-check (a story pinned after it was published): at most every
 *     FEATURED_EVERY_MS, only the currently pinned news of the last 12 hours,
 *     only when an enabled rule uses "öne çıkan".
 *   - Crawler raw items never enter: only `news` documents with status
 *     `published` and own content are considered.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { safeErrorText } from '../safeLog'
import { enqueueJob, existingJobIds, jobIdFor } from './jobs'
import { evaluateRule, newsFactsFrom } from './match'
import type { AutomationRule } from './types'
import type { PublishFormat } from '../accounts/capabilities'
import type { SocialAccountPlatform } from '../accounts/types'

export const RECONCILE_LAG_MS = 2 * 60 * 1000
export const RECONCILE_PAGE = 100
export const RECONCILE_MAX_PAGES = 3
export const FEATURED_EVERY_MS = 15 * 60 * 1000
export const FEATURED_WINDOW_MS = 12 * 60 * 60 * 1000
const STATE_DOC = 'reconcile'

export interface ReconcileState {
  cursor: number | null
  lastFeaturedCheckAt: number | null
  updatedAt: number
}

export interface ReconcileReport {
  ran: boolean
  scanned: number
  featuredScanned: number
  candidates: number
  enqueued: number
  cursorFrom: number | null
  cursorTo: number | null
  errors: string[]
}

function stateRef() {
  return getAdminFirestore().collection(Collections.SOCIAL_AUTOMATION_STATE).doc(STATE_DOC)
}

export async function readReconcileState(): Promise<ReconcileState> {
  const s = await stateRef().get()
  const d = s.exists ? (s.data() as Partial<ReconcileState>) : {}
  return { cursor: d.cursor ?? null, lastFeaturedCheckAt: d.lastFeaturedCheckAt ?? null, updatedAt: d.updatedAt ?? 0 }
}

type NewsDoc = { id: string; data: Record<string, unknown> }

/** Group rule matches by (account, format) → one job each, with every matching rule id. */
export function plannedJobs(
  docs: NewsDoc[],
  rules: AutomationRule[],
  contentProblem: (d: Record<string, unknown>) => string | null,
): Array<{ newsId: string; accountId: string; platform: SocialAccountPlatform; format: PublishFormat; ruleIds: string[]; citySlug: string | null; title: string }> {
  const out = new Map<string, { newsId: string; accountId: string; platform: SocialAccountPlatform; format: PublishFormat; ruleIds: string[]; citySlug: string | null; title: string }>()
  for (const doc of docs) {
    if (contentProblem(doc.data)) continue
    const facts = newsFactsFrom(doc.id, doc.data)
    for (const rule of rules) {
      if (!evaluateRule(rule, facts).match) continue
      for (const format of rule.formats) {
        let id: string
        try {
          id = jobIdFor(doc.id, rule.accountId, format)
        } catch {
          continue
        }
        const cur = out.get(id)
        if (cur) {
          if (!cur.ruleIds.includes(rule.id)) cur.ruleIds.push(rule.id)
        } else {
          out.set(id, {
            newsId: doc.id,
            accountId: rule.accountId,
            platform: rule.platform,
            format,
            ruleIds: [rule.id],
            citySlug: facts.citySlug || null,
            title: typeof doc.data.title === 'string' ? doc.data.title : '',
          })
        }
      }
    }
  }
  return [...out.values()]
}

async function enqueuePlanned(plan: ReturnType<typeof plannedJobs>, now: number): Promise<number> {
  if (plan.length === 0) return 0
  const existing = await existingJobIds(plan.map((p) => jobIdFor(p.newsId, p.accountId, p.format)))
  let n = 0
  for (const p of plan) {
    if (existing.has(jobIdFor(p.newsId, p.accountId, p.format))) continue
    const r = await enqueueJob({ ...p, newsTitle: p.title, dueAt: now, now })
    if (r === 'created') n++
  }
  return n
}

export async function reconcile(input: {
  now: number
  rules: AutomationRule[]
  contentProblem: (d: Record<string, unknown>) => string | null
}): Promise<ReconcileReport> {
  const report: ReconcileReport = { ran: false, scanned: 0, featuredScanned: 0, candidates: 0, enqueued: 0, cursorFrom: null, cursorTo: null, errors: [] }
  const enabled = input.rules.filter((r) => r.enabled && r.enabledAt !== null)
  if (enabled.length === 0) return report
  report.ran = true
  const db = getAdminFirestore()
  const state = await readReconcileState()
  const minEnabledAt = Math.min(...enabled.map((r) => r.enabledAt as number))
  const upper = input.now - RECONCILE_LAG_MS
  let from = Math.max(state.cursor ?? 0, minEnabledAt - 1)
  report.cursorFrom = from

  const docs: NewsDoc[] = []
  for (let page = 0; page < RECONCILE_MAX_PAGES && from < upper; page++) {
    const snap = await db
      .collection(Collections.NEWS)
      .where('publishedAt', '>', from)
      .where('publishedAt', '<=', upper)
      .orderBy('publishedAt', 'asc')
      .limit(RECONCILE_PAGE)
      .get()
    for (const d of snap.docs) docs.push({ id: d.id, data: d.data() as Record<string, unknown> })
    if (snap.docs.length < RECONCILE_PAGE) {
      from = upper
      break
    }
    const last = snap.docs[snap.docs.length - 1].data() as { publishedAt?: number }
    from = typeof last.publishedAt === 'number' ? last.publishedAt : upper
  }
  report.scanned = docs.length

  // Featured re-check (pins added after publish).
  let lastFeaturedCheckAt = state.lastFeaturedCheckAt
  const featuredRules = enabled.filter((r) => r.featuredMode !== 'categories_only')
  if (featuredRules.length > 0 && (lastFeaturedCheckAt === null || input.now - lastFeaturedCheckAt >= FEATURED_EVERY_MS)) {
    const since = Math.max(input.now - FEATURED_WINDOW_MS, Math.min(...featuredRules.map((r) => r.enabledAt as number)))
    const seen = new Set(docs.map((d) => d.id))
    const queries: Array<[string, string]> = [['featured', 'national'], ['localFeatured', 'local']]
    for (const [field, label] of queries) {
      try {
        const snap = await db
          .collection(Collections.NEWS)
          .where(field, '==', true)
          .where('status', '==', 'published')
          .where('publishedAt', '>=', since)
          .orderBy('publishedAt', 'desc')
          .limit(50)
          .get()
        for (const d of snap.docs) {
          report.featuredScanned++
          if (seen.has(d.id)) continue
          seen.add(d.id)
          docs.push({ id: d.id, data: d.data() as Record<string, unknown> })
        }
      } catch (err) {
        // e.g. composite index not deployed yet — publish-time evaluation still works.
        report.errors.push(`featured_${label}: ${safeErrorText(err).slice(0, 120)}`)
      }
    }
    lastFeaturedCheckAt = input.now
  }

  const plan = plannedJobs(docs, enabled, input.contentProblem)
  report.candidates = plan.length
  report.enqueued = await enqueuePlanned(plan, input.now)
  report.cursorTo = from
  await stateRef().set({ cursor: from, lastFeaturedCheckAt, updatedAt: input.now })
  return report
}
