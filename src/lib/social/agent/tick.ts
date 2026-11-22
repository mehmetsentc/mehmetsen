/**
 * GÖREV 43 B2 — Gölge mod tick'i. Mevcut /api/cron/social-automation
 * çalışanına eklenir (yeni cron yok). HİÇBİR ŞEY YAYIMLAMAZ.
 *
 * Açma: SOCIAL_AGENT_SHADOW_ENABLED=1 ve hesapta mod = shadow + en az bir aralık.
 * Maliyet: aralığı dolmuş hesap yoksa yalnızca ayarlar okunur (birkaç belge).
 * Aralık dolmuşsa tick başına tek haber sorgusu (son 12 saat, ≤400) + hesap başına
 * karar kaydı sorgusu. Yapay zekâ çağrısı yok (puanlama kurallı ve açıklanabilir).
 */
import { listRules } from '@/lib/social/automation/ruleStore'
import { evaluateRuleConditions, newsFactsFrom, type NewsFacts } from '@/lib/social/automation/match'
import { sensitivityFromDoc } from '@/lib/social/sensitiveNews'
import { getSocialAccount } from '@/lib/social/accounts/accountStore'
import {
  CANDIDATE_MAX_AGE_MS,
  MIN_PROFILE_SAMPLES,
  buildPreferenceProfile,
  dueSlot,
  evaluateShadow,
  scoreCandidates,
  type AgentCandidate,
  type AgentSettings,
} from './core'
import {
  listAgentSettings,
  listShadowRuns,
  loadDecisions,
  loadRecentPublishedNews,
  shadowRunExists,
  shadowRunId,
  updateShadowEvaluation,
  writeShadowRun,
  type ShadowRun,
} from './store'

export const EVALUATE_AFTER_MS = 2 * 3_600_000
const PROFILE_WINDOW_MS = 60 * 86_400_000

export function agentShadowEnabled(): boolean {
  return process.env.SOCIAL_AGENT_SHADOW_ENABLED?.trim() === '1'
}

export interface AgentTickReport {
  enabled: boolean
  accounts: number
  ran: Array<{ accountId: string; slotKey: string; status: ShadowRun['status']; picks: number }>
  evaluated: number
  errors: string[]
}

function hasImage(d: Record<string, unknown>): boolean {
  return Boolean(d.thumbnail || d.imageUrl || d.image || d.coverImage)
}

/** Hesabın kapsamına uyan adaylar: hesabın otomasyon kuralı varsa onun koşulları, yoksa hesabın ili. */
export function accountScopeFilter(
  rules: Awaited<ReturnType<typeof listRules>>,
  accountId: string,
  ownerCitySlug: string | null
): (n: NewsFacts) => boolean {
  const own = rules.filter((r) => r.accountId === accountId)
  if (own.length > 0) return (n) => own.some((r) => evaluateRuleConditions(r, n).match)
  if (ownerCitySlug) return (n) => n.citySlug === ownerCitySlug
  return () => true
}

export async function runAgentShadowTick(now = Date.now()): Promise<AgentTickReport> {
  const report: AgentTickReport = { enabled: agentShadowEnabled(), accounts: 0, ran: [], evaluated: 0, errors: [] }
  if (!report.enabled) return report
  const settings = (await listAgentSettings()).filter((s) => s.mode !== 'off' && s.slots.length > 0)
  report.accounts = settings.length
  if (settings.length === 0) return report

  // 1) Dolmuş aralıklar
  const due: Array<{ s: AgentSettings; slot: NonNullable<ReturnType<typeof dueSlot>> }> = []
  for (const s of settings) {
    const slot = dueSlot(s, now, () => false)
    if (slot && !(await shadowRunExists(s.accountId, slot.slotKey))) due.push({ s, slot })
  }

  if (due.length > 0) {
    const [news, rules] = await Promise.all([loadRecentPublishedNews(now, CANDIDATE_MAX_AGE_MS), listRules()])
    const pool: AgentCandidate[] = news.map(({ id, data }) => ({
      facts: newsFactsFrom(id, data),
      title: String(data.title ?? '').slice(0, 160),
      hasImage: hasImage(data),
      sensitivityLevel: sensitivityFromDoc(data).level,
    }))
    for (const { s, slot } of due) {
      try {
        const decisions = await loadDecisions(s.accountId, now - PROFILE_WINDOW_MS)
        const profile = buildPreferenceProfile(s.accountId, decisions, now)
        const account = await getSocialAccount(s.accountId)
        const inScope = accountScopeFilter(rules, s.accountId, account?.ownership?.citySlug ?? null)
        const candidates = pool.filter((c) => inScope(c.facts))
        const shared = new Set(decisions.filter((d) => d.at >= now - 48 * 3_600_000).map((d) => d.newsId))
        const scored = profile.samples >= MIN_PROFILE_SAMPLES ? scoreCandidates(profile, candidates, now, shared) : []
        const run: ShadowRun = {
          id: shadowRunId(s.accountId, slot.slotKey),
          accountId: s.accountId,
          slotKey: slot.slotKey,
          windowStart: slot.windowStart,
          windowEnd: slot.windowEnd,
          ranAt: now,
          status: profile.samples < MIN_PROFILE_SAMPLES ? 'insufficient_data' : scored.length ? 'picked' : 'no_candidate',
          samples: profile.samples,
          considered: candidates.length,
          picks: scored.slice(0, s.picksPerSlot),
          awayAtSlot: Boolean(s.awayUntil && s.awayUntil > slot.windowEnd),
          evaluation: null,
          evaluatedAt: null,
        }
        await writeShadowRun(run)
        report.ran.push({ accountId: s.accountId, slotKey: slot.slotKey, status: run.status, picks: run.picks.length })
      } catch (err) {
        const code = (err as { code?: number })?.code
        if (code === 6) continue // ALREADY_EXISTS — başka tick yazdı
        report.errors.push(`${s.accountId}: ${err instanceof Error ? err.name : 'error'}`)
      }
    }
  }

  // 2) Karşılaştırma: aralıktan 2 saat sonra editörün gerçek paylaşımlarıyla
  for (const s of settings) {
    try {
      const pending = (await listShadowRuns(s.accountId, 60)).filter(
        (r) => r.evaluatedAt === null && r.status === 'picked' && r.windowEnd + EVALUATE_AFTER_MS <= now
      )
      if (pending.length === 0) continue
      const oldest = Math.min(...pending.map((r) => r.windowStart))
      const decisions = (await loadDecisions(s.accountId, oldest)).filter((d) => d.source === 'composer')
      for (const r of pending) {
        const manual = decisions
          .filter((d) => d.at > r.windowStart && d.at <= r.windowEnd + EVALUATE_AFTER_MS)
          .map((d) => d.newsId)
        await updateShadowEvaluation(r.id, evaluateShadow(r.picks.map((p) => p.newsId), manual), now)
        report.evaluated += 1
      }
    } catch (err) {
      report.errors.push(`eval ${s.accountId}: ${err instanceof Error ? err.name : 'error'}`)
    }
  }
  return report
}
