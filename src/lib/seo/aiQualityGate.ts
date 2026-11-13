/**
 * SEO-11 — index gate for AI-rewritten articles (user-approved 13 Oct 2026).
 *
 * GSC (13 Oct): 22.8k URLs "Discovered – not indexed", 1.5k "Crawled – not indexed"
 * while ~550 AI rewrites/day are published. Google treats the site as low value
 * per URL. Only the stronger AI stories stay indexable; the rest are served with
 * noindex,follow and left out of sitemaps. They stay on the homepage, feeds and
 * category pages (no product change), and keep passing links.
 *
 * Applies only to AI-written articles published after the cutoff that carry the
 * stored pipeline word count, so older URLs and human-written stories never move.
 * Kill switch: SEO_AI_QUALITY_GATE=off.
 */

import { articleBlocksToPlainText, type ArticleBlock } from '@/lib/articleBlocks'
import { countPlainWords } from '@/lib/contentQuality'
import { TURKISH_PROVINCES } from '@/constants/cities'

/** 15 Oct 2026 00:00 Europe/Istanbul. */
export const AI_QUALITY_GATE_CUTOFF_MS = Date.parse('2026-10-14T21:00:00.000Z')
/** Project focus cities (local authority we are building). */
export const AI_QUALITY_FOCUS_CITIES: ReadonlySet<string> = new Set(['canakkale', 'antalya'])
export const AI_QUALITY_MIN_WORDS = 400
/** Researched stories (≥2 research sources) qualify a little earlier. */
export const AI_QUALITY_MIN_WORDS_RESEARCHED = 300

/**
 * SEO-19 (user-approved 13 Nov 2026). SEO-13 made every AI story 450–650 words, so
 * the 400-word rule let nearly all of them through again. GSC 9 Nov: indexed pages
 * 20.9k → 17.9k, «Tarandı – dizinde değil» 1.4k → 3.5k, latest examples generic
 * rewrites everyone publishes (fragman, iOS tanıtımı, yabancı gündem).
 * From 22 Oct (SEO-13 live) length no longer earns indexing on its own: an AI story
 * is indexable when it is local (a Turkish province from the content), researched
 * (≥2 sources), an editor pick / featured, or an analysis / column. Everything else
 * stays published (homepage, feeds, social) with noindex,follow.
 * Kill switch for this stricter part only: SEO_AI_STRICT_GATE=off.
 */
export const AI_QUALITY_STRICT_FROM_MS = Date.parse('2026-10-21T21:00:00.000Z')
const PROVINCE_SLUGS: ReadonlySet<string> = new Set(TURKISH_PROVINCES.map((p) => p.slug))

export function isAiStrictGateEnabled(): boolean {
  return (process.env.SEO_AI_STRICT_GATE ?? '').trim().toLowerCase() !== 'off'
}

export type AiQualityGateInput = {
  aiEditorId?: string | null
  authorIsAI?: boolean | null
  isAI?: boolean | null
  /** Set by the newsroom pipeline on every AI rewrite (SEO-11b). */
  aiGenerated?: boolean | null
  /** Only the AI pipeline publishes with this flag (SEO-11b). */
  aiAutoPublished?: boolean | null
  authorId?: string | null
  publishedAt?: unknown
  seoWordCount?: number | null
  seoResearchSourceCount?: number | null
  citySlug?: string | null
  isEditorPick?: boolean | null
  featured?: boolean | null
  articleFormat?: string | null
}

export function isAiQualityGateEnabled(): boolean {
  return (process.env.SEO_AI_QUALITY_GATE ?? '').trim().toLowerCase() !== 'off'
}

function toMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : null
  }
  if (value instanceof Date) return value.getTime()
  if (value && typeof value === 'object' && 'toMillis' in value) {
    try {
      return (value as { toMillis: () => number }).toMillis()
    } catch {
      return null
    }
  }
  return null
}

/**
 * SEO-11b: rewrites published without a persona carry the NaHaber house author and no
 * aiEditorId, so the persona checks alone missed ~all crawler/RSS rewrites (live 21 Oct:
 * a 168-word rewrite was still «index»). The pipeline's own flags close that gap.
 */
function isAiWritten(p: AiQualityGateInput): boolean {
  return (
    p.aiGenerated === true ||
    p.aiAutoPublished === true ||
    Boolean(p.aiEditorId?.trim()) ||
    p.authorIsAI === true ||
    p.isAI === true ||
    Boolean(p.authorId?.startsWith('ai_editor_'))
  )
}

/** True when an AI article should be noindex,follow and kept out of sitemaps. */
export function failsAiQualityGate(p: AiQualityGateInput, enabled = isAiQualityGateEnabled()): boolean {
  if (!enabled) return false
  if (typeof p.seoWordCount !== 'number' || !Number.isFinite(p.seoWordCount)) return false
  if (!isAiWritten(p)) return false
  const publishedMs = toMs(p.publishedAt)
  if (publishedMs == null || publishedMs < AI_QUALITY_GATE_CUTOFF_MS) return false

  const city = p.citySlug?.trim().toLowerCase()
  if (city && AI_QUALITY_FOCUS_CITIES.has(city)) return false
  if (p.isEditorPick === true || p.featured === true) return false
  if (p.articleFormat === 'analysis' || p.articleFormat === 'column') return false
  if (publishedMs >= AI_QUALITY_STRICT_FROM_MS && isAiStrictGateEnabled()) {
    if (city && PROVINCE_SLUGS.has(city)) return false
    return !((p.seoResearchSourceCount ?? 0) >= 2 && p.seoWordCount >= AI_QUALITY_MIN_WORDS_RESEARCHED)
  }
  if (p.seoWordCount >= AI_QUALITY_MIN_WORDS) return false
  if ((p.seoResearchSourceCount ?? 0) >= 2 && p.seoWordCount >= AI_QUALITY_MIN_WORDS_RESEARCHED) {
    return false
  }
  return true
}

/**
 * SEO-11c: draft → publish (newsDraftService.draftToPublishedNews) dropped the stored
 * seoWordCount until 21 Oct, so the gate skipped every pipeline story. On the article page
 * the body is loaded anyway: count it when the stored number is missing (body only, like
 * the pipeline's readingWords). Sitemaps have no body and keep using the stored field.
 */
export function gateWordCount(p: {
  seoWordCount?: number | null
  bodyBlocks?: ArticleBlock[] | null
  content?: string | null
}): number | null {
  if (typeof p.seoWordCount === 'number' && Number.isFinite(p.seoWordCount)) return p.seoWordCount
  const blockText = p.bodyBlocks?.length ? articleBlocksToPlainText(p.bodyBlocks) : ''
  const n = countPlainWords(blockText || p.content || '')
  return n > 0 ? n : null
}
