/**
 * SCALE/P4 Track C — read-only "best past articles" for an editor.
 * Zero extra AI calls. Does not inject into promptBuilder.
 */

import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const DEFAULT_BEST_EXAMPLE_MIN_SCORE = 80
export const DEFAULT_BEST_EXAMPLE_LIMIT = 3

export type EditorBestExample = {
  newsId: string
  title: string
  summary: string
  publishScore: number
  gateDecision: string | null
  publishedAt: string | null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function formatBestExamplesForPrompt(examples: EditorBestExample[]): string {
  if (examples.length === 0) return ''
  const lines = examples.map((ex, i) => {
    const score = Math.round(ex.publishScore)
    const date = ex.publishedAt?.slice(0, 10) ?? ''
    const summary = ex.summary.trim() ? ` — ${ex.summary.trim()}` : ''
    return `${i + 1}. "${ex.title}"${summary}${date ? ` (${date}, skor ${score})` : ` (skor ${score})`}`
  })
  return [
    'SENİN DAHA ÖNCE YAZDIĞIN, YÜKSEK PUAN ALAN ÖRNEKLER — bu tarzda devam et (kopyalama yok; yeni habere uyarla):',
    ...lines,
  ].join('\n')
}

export async function fetchEditorBestExamples(
  editorId: string,
  opts?: { minScore?: number; limit?: number; lookbackMs?: number }
): Promise<EditorBestExample[]> {
  const minScore = opts?.minScore ?? DEFAULT_BEST_EXAMPLE_MIN_SCORE
  const limit = opts?.limit ?? DEFAULT_BEST_EXAMPLE_LIMIT
  const lookbackMs = opts?.lookbackMs ?? 90 * 24 * 60 * 60 * 1000
  const since = Date.now() - lookbackMs
  const db = getAdminFirestore()

  let snap
  try {
    snap = await db
      .collection(Collections.AI_USAGE_EVENTS)
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(800)
      .get()
  } catch {
    snap = await db.collection(Collections.AI_USAGE_EVENTS).orderBy('createdAt', 'desc').limit(400).get()
  }

  type Cand = {
    newsId: string
    publishScore: number
    gateDecision: string | null
    createdAt: number
    eventEditor: string | null
  }
  const ranked: Cand[] = []
  for (const doc of snap.docs) {
    const row = doc.data() as Record<string, unknown>
    const agent = asString(row.agentName)
    if (agent && agent !== 'stage4_gate') continue
    const score = asNumber(row.publishScore)
    const newsId = asString(row.newsId)
    const eventEditor = asString(row.editorId)
    if (score == null || score < minScore || !newsId) continue
    if (eventEditor && eventEditor !== editorId) continue
    ranked.push({
      newsId,
      publishScore: score,
      gateDecision: asString(row.gateDecision),
      createdAt: asNumber(row.createdAt) ?? 0,
      eventEditor,
    })
  }

  ranked.sort((a, b) => b.publishScore - a.publishScore || b.createdAt - a.createdAt)
  const seen = new Set<string>()
  const out: EditorBestExample[] = []
  for (const cand of ranked) {
    if (out.length >= limit) break
    if (seen.has(cand.newsId)) continue
    seen.add(cand.newsId)
    const newsSnap = await db.collection(Collections.NEWS).doc(cand.newsId).get()
    if (!newsSnap.exists) continue
    const news = newsSnap.data() as Record<string, unknown>
    const newsEditor = asString(news.aiEditorId)
    if (cand.eventEditor !== editorId && newsEditor !== editorId) continue
    const publishedRaw = news.publishedAt
    out.push({
      newsId: cand.newsId,
      title: asString(news.title) || cand.newsId,
      summary: (asString(news.summary) || asString(news.spot) || '').slice(0, 220),
      publishScore: cand.publishScore,
      gateDecision: cand.gateDecision,
      publishedAt:
        asString(publishedRaw) ||
        (asNumber(publishedRaw) ? new Date(asNumber(publishedRaw)!).toISOString() : null),
    })
  }
  return out
}
