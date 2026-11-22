/**
 * GÖREV 43 A2 — «AI ile yaz» sonrası editörün il / ilçe / kategori düzeltmeleri.
 *
 * Amaç: (1) gerçek hata oranını ölçmek, (2) sık tekrarlanan düzeltmeleri kural
 * veya talimat örneğine çevirmek. Model yeniden eğitilmez.
 * Yalnızca sunucu yazar (firestore.rules: aiFieldCorrections istemciye kapalı).
 * Kayıt token / e-posta / kişisel veri içermez; uid iç kimliktir.
 */
import type { Firestore } from 'firebase-admin/firestore'

export const AI_FIELD_CORRECTIONS_COLLECTION = 'aiFieldCorrections'

export type CorrectableField = 'citySlug' | 'districtSlug' | 'categoryId'
const FIELDS: CorrectableField[] = ['citySlug', 'districtSlug', 'categoryId']

export interface AiFieldChange {
  field: CorrectableField
  from: string
  to: string
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Haber AI hattından mı çıktı (editör seçimli yazım ya da Ham Haberler «AI ile yaz»)? */
export function isAiProducedNews(prev: Record<string, unknown> | undefined | null): boolean {
  if (!prev) return false
  return Boolean(
    str(prev.aiEditorId) ||
      str(prev.rssFingerprint).startsWith('crawler-editor:') ||
      prev.aiWritten === true ||
      prev.aiGenerated === true
  )
}

/** Önceki kayıt ile güncelleme arasındaki konum/kategori farkları. */
export function diffAiFields(
  prev: Record<string, unknown> | undefined | null,
  update: Record<string, unknown>
): AiFieldChange[] {
  if (!isAiProducedNews(prev)) return []
  const out: AiFieldChange[] = []
  for (const field of FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(update, field)) continue
    const from = str(prev?.[field])
    const to = str(update[field])
    if (from !== to) out.push({ field, from, to })
  }
  return out
}

function sourceHost(url: unknown): string {
  try {
    return new URL(str(url)).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Fire-and-forget; hata kaydı engellemez. */
export async function recordAiFieldCorrections(
  db: Firestore,
  input: {
    newsId: string
    prev: Record<string, unknown> | undefined | null
    update: Record<string, unknown>
    uid: string
    now?: number
  }
): Promise<number> {
  const changes = diffAiFields(input.prev, input.update)
  if (changes.length === 0) return 0
  const now = input.now ?? Date.now()
  const prev = input.prev ?? {}
  try {
    await db
      .collection(AI_FIELD_CORRECTIONS_COLLECTION)
      .doc(`${input.newsId}_${now}`)
      .set({
        newsId: input.newsId,
        changes,
        title: str(prev.title).slice(0, 160),
        sourceLabel: str(prev.sourceLabel || prev.source).slice(0, 80),
        sourceHost: sourceHost(prev.sourceUrl),
        aiEditorId: str(prev.aiEditorId) || null,
        statusBefore: str(prev.status) || null,
        uid: input.uid,
        createdAt: new Date(now),
      })
    return changes.length
  } catch (err) {
    console.warn('[aiFieldCorrections] yazılamadı', err instanceof Error ? err.message : err)
    return 0
  }
}

export interface CorrectionSummary {
  total: number
  byField: Record<CorrectableField, number>
  topPairs: Array<{ field: CorrectableField; from: string; to: string; count: number }>
  topSources: Array<{ sourceHost: string; count: number }>
}

/** Panel / rapor için özet (saf fonksiyon). */
export function summarizeCorrections(
  rows: Array<{ changes: AiFieldChange[]; sourceHost?: string }>
): CorrectionSummary {
  const byField: Record<CorrectableField, number> = { citySlug: 0, districtSlug: 0, categoryId: 0 }
  const pairs = new Map<string, { field: CorrectableField; from: string; to: string; count: number }>()
  const sources = new Map<string, number>()
  for (const row of rows) {
    for (const c of row.changes) {
      byField[c.field] += 1
      const k = `${c.field}|${c.from}|${c.to}`
      const cur = pairs.get(k) ?? { ...c, count: 0 }
      cur.count += 1
      pairs.set(k, cur)
    }
    if (row.sourceHost) sources.set(row.sourceHost, (sources.get(row.sourceHost) ?? 0) + 1)
  }
  return {
    total: rows.length,
    byField,
    topPairs: [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, 20),
    topSources: [...sources.entries()]
      .map(([sourceHost, count]) => ({ sourceHost, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
  }
}
