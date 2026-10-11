/**
 * Publish / edit hook for account-bound automation.
 *
 * Called SYNCHRONOUSLY from CMS write routes (before the response is sent):
 * the job documents it creates are the durable record of the publish event,
 * so a killed request or a lost `after()` never loses work — the 5-minute
 * worker tick picks up anything still queued. `after()` is used only to start
 * processing right away (best effort).
 *
 * On every relevant write the news is re-evaluated against the enabled rules:
 *   - newly matching (account, format) → job created (or a cancelled-not-sent
 *     job revived); due at max(now, publishedAt) → future-dated news waits
 *   - queued jobs that no longer match (geo / category / featured changed,
 *     news unpublished or removed) → cancelled
 *   - published / processing / uncertain jobs are never touched; the ledger
 *     still blocks a second post to the same account + format
 *
 * Cost: one cached rules query (30 s) per write; no news scan. With no enabled
 * rule and no prior job nothing else is read.
 */
import { after } from 'next/server'
import { safeErrorText, socialLog } from '../safeLog'
import { enqueueJob, jobIdFor, listJobsForNews, reviseJob, claimJobById, type AutomationJob } from './jobs'
import { evaluateRule, newsFactsFrom } from './match'
import { enabledRulesCached, listRules } from './ruleStore'
import type { AutomationRule } from './types'

export interface NewsSyncInput {
  newsId: string
  /** Merged document after the write (or null when deleted). */
  data: Record<string, unknown> | null
  /** True when THIS write moved the news into `published`. */
  becamePublished: boolean
  /** True when the news was published before this write (cancellation still needed when it leaves). */
  wasPublished: boolean
  now: number
}

export interface NewsSyncResult {
  created: string[]
  requeued: string[]
  cancelled: string[]
  /** Jobs due now — the caller may start them in `after()`. */
  dueNow: string[]
}

type ContentProblem = (d: Record<string, unknown>) => string | null

export async function syncNewsAutomation(input: NewsSyncInput, contentProblem: ContentProblem): Promise<NewsSyncResult> {
  const out: NewsSyncResult = { created: [], requeued: [], cancelled: [], dueNow: [] }
  const published = !!input.data && String(input.data.status ?? '').toLowerCase() === 'published'
  // Jobs exist only for published news: a draft that never went live needs no read at all.
  if (!published && !input.wasPublished) return out
  const rules = await enabledRulesCached(input.now)
  if (rules.length === 0 && !input.wasPublished) return out

  const existing = rules.length > 0 || input.wasPublished ? await listJobsForNews(input.newsId) : []
  const byId = new Map(existing.map((j) => [j.id, j]))

  if (!published || !input.data) {
    for (const j of existing) {
      if (j.status !== 'queued') continue
      if ((await reviseJob(j.id, { kind: 'cancel', code: input.data ? 'news_unpublished' : 'news_removed' }, input.now)) === 'cancelled') out.cancelled.push(j.id)
    }
    return out
  }

  const data = input.data
  const facts = newsFactsFrom(input.newsId, data)
  // A news going live now counts from now (an old date on a draft is not a backfill path).
  if (input.becamePublished) facts.eligibleAt = Math.max(facts.publishedAt ?? input.now, input.now)
  else if (facts.eligibleAt === null) facts.eligibleAt = earliestEligible(existing)

  const problem = contentProblem(data)
  const planned = new Map<string, { accountId: string; platform: AutomationRule['platform']; format: 'post' | 'story'; ruleIds: string[] }>()
  if (!problem) {
    for (const rule of rules) {
      if (!evaluateRule(rule, facts).match) continue
      for (const format of rule.formats) {
        let id: string
        try {
          id = jobIdFor(input.newsId, rule.accountId, format)
        } catch {
          continue
        }
        const p = planned.get(id)
        if (p) p.ruleIds.push(rule.id)
        else planned.set(id, { accountId: rule.accountId, platform: rule.platform, format, ruleIds: [rule.id] })
      }
    }
  }

  const dueAt = Math.max(input.now, facts.publishedAt ?? input.now)
  for (const j of existing) {
    if (j.status === 'queued' && !planned.has(j.id)) {
      if ((await reviseJob(j.id, { kind: 'cancel', code: 'conditions_changed' }, input.now)) === 'cancelled') out.cancelled.push(j.id)
    }
  }
  for (const [id, p] of planned) {
    const cur = byId.get(id)
    if (!cur) {
      const r = await enqueueJob({
        newsId: input.newsId,
        accountId: p.accountId,
        platform: p.platform,
        format: p.format,
        ruleIds: p.ruleIds,
        citySlug: facts.citySlug || null,
        newsTitle: typeof data.title === 'string' ? data.title : '',
        eligibleAt: facts.eligibleAt,
        dueAt,
        now: input.now,
      })
      if (r === 'created') out.created.push(id)
    } else {
      const r = await reviseJob(id, { kind: 'requeue', dueAt, eligibleAt: facts.eligibleAt, ruleIds: p.ruleIds }, input.now)
      if (r === 'requeued') out.requeued.push(id)
    }
    if (dueAt <= input.now) out.dueNow.push(id)
  }
  return out
}

function earliestEligible(jobs: AutomationJob[]): number | null {
  const v = jobs.map((j) => j.eligibleAt).filter((x): x is number => typeof x === 'number')
  return v.length ? Math.min(...v) : null
}

/**
 * Route-side wrapper: never throws into the CMS write. Returns the jobs that
 * can start immediately (the caller passes them to `startAutomationJobs` in
 * `after()`; if that is lost the worker tick handles them).
 */
export async function onNewsWritten(input: NewsSyncInput): Promise<string[]> {
  try {
    const mod = await import('../publishOneSocial')
    const { automationContentProblemWith } = await import('./worker')
    const r = await syncNewsAutomation(input, (d) => automationContentProblemWith(d, mod))
    if (r.created.length || r.requeued.length || r.cancelled.length) {
      socialLog('log', 'cron', 'automation_news_sync', {
        newsId: input.newsId,
        created: r.created.length,
        requeued: r.requeued.length,
        cancelled: r.cancelled.length,
        dueNow: r.dueNow.length,
      })
    }
    return r.dueNow
  } catch (err) {
    socialLog('error', 'cron', 'automation_news_sync_error', { newsId: input.newsId, error: safeErrorText(err).slice(0, 200) })
    return []
  }
}

/** Best-effort immediate processing of specific jobs (after()); the tick is the guarantee. */
export async function startAutomationJobs(jobIds: string[], now: () => number = Date.now): Promise<void> {
  if (jobIds.length === 0) return
  try {
    const { isSocialTestMode } = await import('../testEnvironment')
    if (isSocialTestMode()) return
    const mod = await import('../publishOneSocial')
    const { automationContentProblemWith, runClaimedJob } = await import('./worker')
    const rules = await listRules({ enabledOnly: true })
    for (const id of jobIds.slice(0, 3)) {
      const job = await claimJobById(id, now())
      if (!job) continue
      await runClaimedJob(job, rules, mod.publishOneSocial, (d) => automationContentProblemWith(d, mod), now)
    }
  } catch (err) {
    socialLog('error', 'cron', 'automation_start_error', { error: safeErrorText(err).slice(0, 200) })
  }
}

/** after() helper for routes whose service already wrote the jobs (draft approval). */
export async function startAutomationJobsForNews(newsId: string, now: () => number = Date.now): Promise<void> {
  try {
    if ((await enabledRulesCached(now())).length === 0) return
    const due = (await listJobsForNews(newsId)).filter((j) => j.status === 'queued' && j.autoDueAt !== null && j.autoDueAt <= now()).map((j) => j.id)
    await startAutomationJobs(due, now)
  } catch (err) {
    socialLog('error', 'cron', 'automation_start_error', { newsId, error: safeErrorText(err).slice(0, 200) })
  }
}

/**
 * Start work after the response when a request scope exists. Outside one
 * (tests, scripts) nothing is started — the job is already durable and the
 * worker tick sends it. Never throws into the caller.
 */
export function startAfterResponse(fn: () => Promise<void>): void {
  try {
    after(fn)
  } catch {
    /* no request scope — the 5-minute worker picks the job up */
  }
}
