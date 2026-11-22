/**
 * GÖREV 43 B — Vekil editör kalıcı kayıtları (yalnızca sunucu; istemciye kapalı).
 *
 *   socialDecisionLog/{haber__hesap__biçim}     editörün başarılı elle paylaşımları
 *   socialAgentSettings/{accountId}             mod, yayın aralıkları, «Yoktayım»
 *   socialAgentShadowRuns/{accountId__aralık}   gölge seçimleri ve karşılaştırma
 *
 * Sorgular tek alan eşitliğiyle yapılır (yeni bileşik indeks gerekmez); hacim
 * hesap başına günde birkaç kayıt olduğu için bellek içi süzme ucuzdur.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  decisionId,
  successfulTargets,
  type AgentMode,
  type AgentSettings,
  type ShadowEvaluation,
  type ScoredCandidate,
  type ShareDecision,
} from './core'

export const DECISIONS = 'socialDecisionLog'
export const SETTINGS = 'socialAgentSettings'
export const SHADOW_RUNS = 'socialAgentShadowRuns'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis()
  return null
}

export function decisionsFromPublish(input: {
  newsId: string
  news: Record<string, unknown> | null
  result: Parameters<typeof successfulTargets>[0]
  actorUid: string | null
  at: number
  source: ShareDecision['source']
}): ShareDecision[] {
  const n = input.news ?? {}
  return successfulTargets(input.result).map((t) => ({
    newsId: input.newsId,
    accountId: t.accountId,
    platform: t.platform,
    format: t.format,
    at: input.at,
    actorUid: input.actorUid,
    source: input.source,
    categoryId: str(n.categoryId ?? n.category).toLowerCase(),
    citySlug: str(n.citySlug).toLowerCase(),
    featured: n.featured === true || n.isFeatured === true || n.localFeatured === true,
    newsPublishedAt: num(n.publishedAt),
  }))
}

/** Elle paylaşım sonrası; hata paylaşımı etkilemez. Belge kimliği tekil → tekrar yazım zararsız. */
export async function recordShareDecisions(decisions: ShareDecision[]): Promise<number> {
  if (decisions.length === 0) return 0
  try {
    const db = getAdminFirestore()
    const batch = db.batch()
    for (const d of decisions) batch.set(db.collection(DECISIONS).doc(decisionId(d)), d, { merge: true })
    await batch.commit()
    return decisions.length
  } catch (err) {
    console.warn('[social-agent] karar kaydı yazılamadı', err instanceof Error ? err.name : 'error')
    return 0
  }
}

export async function loadDecisions(accountId: string, sinceMs: number): Promise<ShareDecision[]> {
  const snap = await getAdminFirestore().collection(DECISIONS).where('accountId', '==', accountId).limit(2000).get()
  return snap.docs.map((d) => d.data() as ShareDecision).filter((d) => typeof d.at === 'number' && d.at >= sinceMs)
}

// ── Ayarlar ───────────────────────────────────────────────────────────────

export function defaultSettings(accountId: string): AgentSettings {
  return { accountId, mode: 'off', slots: [], awayUntil: null, picksPerSlot: 3, updatedAt: 0, updatedBy: null }
}

function parseSettings(id: string, d: Record<string, unknown> | undefined): AgentSettings {
  const base = defaultSettings(id)
  if (!d) return base
  const mode = (['off', 'shadow', 'approval', 'auto'] as AgentMode[]).includes(d.mode as AgentMode) ? (d.mode as AgentMode) : 'off'
  return {
    ...base,
    mode,
    slots: Array.isArray(d.slots) ? d.slots.map(String) : [],
    awayUntil: num(d.awayUntil),
    picksPerSlot: typeof d.picksPerSlot === 'number' ? Math.min(5, Math.max(1, Math.round(d.picksPerSlot))) : 3,
    updatedAt: num(d.updatedAt) ?? 0,
    updatedBy: str(d.updatedBy) || null,
  }
}

export async function listAgentSettings(): Promise<AgentSettings[]> {
  const snap = await getAdminFirestore().collection(SETTINGS).limit(500).get()
  return snap.docs.map((d) => parseSettings(d.id, d.data()))
}

export async function getAgentSettings(accountId: string): Promise<AgentSettings> {
  const snap = await getAdminFirestore().collection(SETTINGS).doc(accountId).get()
  return parseSettings(accountId, snap.exists ? snap.data() : undefined)
}

export async function saveAgentSettings(s: AgentSettings): Promise<void> {
  await getAdminFirestore().collection(SETTINGS).doc(s.accountId).set(s)
}

// ── Gölge çalıştırmalar ───────────────────────────────────────────────────

export interface ShadowRun {
  id: string
  accountId: string
  slotKey: string
  windowStart: number
  windowEnd: number
  ranAt: number
  status: 'picked' | 'no_candidate' | 'insufficient_data'
  samples: number
  considered: number
  picks: ScoredCandidate[]
  /** Editör yoktaydı («Yoktayım» açıktı) — B3'te ajan bu aralıkta devreye girerdi. */
  awayAtSlot: boolean
  evaluation: ShadowEvaluation | null
  evaluatedAt: number | null
}

export function shadowRunId(accountId: string, slotKey: string): string {
  return `${accountId}__${slotKey.replace(/[ :]/g, '-')}`
}

export async function listShadowRuns(accountId: string, limit = 200): Promise<ShadowRun[]> {
  const snap = await getAdminFirestore().collection(SHADOW_RUNS).where('accountId', '==', accountId).limit(limit).get()
  return snap.docs.map((d) => d.data() as ShadowRun).sort((a, b) => b.windowEnd - a.windowEnd)
}

export async function shadowRunExists(accountId: string, slotKey: string): Promise<boolean> {
  return (await getAdminFirestore().collection(SHADOW_RUNS).doc(shadowRunId(accountId, slotKey)).get()).exists
}

export async function writeShadowRun(run: ShadowRun): Promise<void> {
  // create(): eşzamanlı iki tick aynı aralığı iki kez yazamaz.
  await getAdminFirestore().collection(SHADOW_RUNS).doc(run.id).create(run)
}

export async function updateShadowEvaluation(id: string, evaluation: ShadowEvaluation, at: number): Promise<void> {
  await getAdminFirestore().collection(SHADOW_RUNS).doc(id).update({ evaluation, evaluatedAt: at })
}

/** Son 12 saatte yayımlanan haberler — aralık başına değil, tick başına tek sorgu. */
export async function loadRecentPublishedNews(now: number, windowMs: number): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const snap = await getAdminFirestore()
    .collection(Collections.NEWS)
    .where('publishedAt', '>', now - windowMs)
    .where('publishedAt', '<=', now)
    .orderBy('publishedAt', 'desc')
    .limit(400)
    .get()
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
}
