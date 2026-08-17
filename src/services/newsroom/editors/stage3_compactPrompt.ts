/**
 * Compact Stage3 prompt + deterministic cost canary.
 * Control (full encyclopedia + 6000-char body) is unchanged unless this cohort is selected.
 * Default OFF: absent ENV → control for every article.
 */

import { groqCohortBucket, classifierCohortKey } from '@/lib/ai/groqRouting'

export const STAGE3_COMPACT_SYSTEM = `Sen NaHaber kategori editörüsün. Ana konuyu seç; yan atıfları yok say.
En spesifik categoryId'yi ver. Tek şehir olayı → yerel-*. KKTC → kibris-*.
isBreaking yalnızca gerçek acil durum. Yalnızca JSON döndür.`

export const STAGE3_COMPACT_ARTICLE_CHARS = 1200

export type Stage3PromptVariant = 'control' | 'compact' | 'control_fallback'

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on'
}

function envPercent(name: string, fallback = 0): number {
  const n = Number(process.env[name] ?? String(fallback))
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.floor(n)))
}

/** Flag on (new or legacy name). Percent still required to select compact. */
export function isStage3CompactPromptEnabled(): boolean {
  return envFlag('AI_STAGE3_COMPACT_PROMPT_ENABLED') || envFlag('AI_STAGE3_COMPACT_PROMPT')
}

export function getStage3CompactPromptPercent(): number {
  return envPercent('AI_STAGE3_COMPACT_PROMPT_PERCENT', 0)
}

export function stage3CanaryCohortKey(explicit?: string | null): string {
  return classifierCohortKey(explicit)
}

export function stage3CanaryBucket(explicit?: string | null): number {
  return groqCohortBucket(stage3CanaryCohortKey(explicit))
}

/**
 * Deterministic 0–99 SHA-256 bucket. Same newsId/queueId/traceId → same cohort.
 * percent 0 or flag off → control. Math.random is not used.
 */
export function shouldUseStage3CompactPrompt(explicit?: string | null): boolean {
  if (!isStage3CompactPromptEnabled()) return false
  const percent = getStage3CompactPromptPercent()
  if (percent <= 0) return false
  if (percent >= 100) return true
  return stage3CanaryBucket(explicit) < percent
}

export function buildCompactStage3UserPrompt(input: {
  title: string
  spot?: string
  content: string
  sourceLabel: string
  currentCategory?: string
  city?: string | null
  country?: string | null
  tags?: string[]
  categoryIds: readonly string[]
  maxArticleChars?: number
}): string {
  const limit = input.maxArticleChars ?? STAGE3_COMPACT_ARTICLE_CHARS
  const excerpt = (input.content || '').slice(0, limit)
  const spot = (input.spot || '').slice(0, 400)
  const locationBits = [input.city, input.country].filter((v) => typeof v === 'string' && v.trim())
  const tags = (input.tags ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
  const ids = input.categoryIds.join('|')
  return `Kaynak: ${input.sourceLabel}
Başlık: ${input.title}
Spot: ${spot}
İçerik (ilk ${limit} karakter):
${excerpt}
${input.currentCategory ? `Mevcut kategori: ${input.currentCategory}` : ''}
${locationBits.length ? `Konum: ${locationBits.join(' / ')}` : ''}
${tags.length ? `Etiketler: ${tags.join(', ')}` : ''}
categoryId (en spesifik, yalnızca bunlardan): ${ids}

JSON:
{"categoryId":"string","isBreaking":false,"confidence":0,"city":null,"district":null,"country":"Türkiye","tags":["string"],"reason":"string"}`
}
