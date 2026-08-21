/**
 * Phase 4D.4 — non-destructive editorial quality flags for AI drafts.
 * Never deletes, publishes, or silently regenerates. No paid AI.
 */

import {
  CANARY_BODY_PROMPT_TARGET_MAX_WORDS,
  CANARY_BODY_PROMPT_TARGET_MIN_WORDS,
  CANARY_BODY_TARGET_MAX_WORDS,
  CANARY_BODY_TARGET_MIN_WORDS,
  wordCount,
} from '../canary/schema'
import { computeSourceContentMetrics, type SourceRichness } from '../canary/sourcePolicy'

export const DRAFT_QUALITY = {
  OK: 'OK',
  QUALITY_WARNING: 'QUALITY_WARNING',
} as const

export type DraftQualityCode = (typeof DRAFT_QUALITY)[keyof typeof DRAFT_QUALITY]

export const DRAFT_QUALITY_LABEL_TR: Record<DraftQualityCode, string> = {
  OK: 'Uygun',
  QUALITY_WARNING: 'Kalite Kontrolü Gerekli',
}

export type AiDraftQualityAssessment = {
  code: DraftQualityCode
  labelTr: string
  bodyWords: number
  usableSourceWords: number | null
  richness: SourceRichness | null
  requiredMin: number | null
  /** Soft prompt target band for rich material. */
  promptTargetMin: number
  promptTargetMax: number
  hardMin: number
  hardMax: number
  reasonsTr: string[]
}

type SourceLike = {
  body?: string | null
  wordCount?: number | null
  sourceId?: string | null
}

/**
 * Assess completed draft for editor-facing QUALITY_WARNING without mutating storage.
 * If pack/sources known: re-evaluate material policy. Else: warn when body < hard rich min.
 */
export function assessAiDraftQuality(input: {
  body: string | null | undefined
  sources?: SourceLike[] | null
  usableSourceWords?: number | null
  richness?: SourceRichness | null
}): AiDraftQualityAssessment {
  const bodyWords = wordCount(input.body || '')
  const reasonsTr: string[] = []

  let usable = input.usableSourceWords ?? null
  let richness: SourceRichness | null = input.richness ?? null
  let requiredMin: number | null = null

  if (input.sources && input.sources.length > 0) {
    const pack = {
      sources: input.sources.map((s, i) => ({
        articleId: `a${i}`,
        sourceId: s.sourceId || `s${i}`,
        sourceName: 'src',
        publishedAt: null as Date | null,
        title: '',
        body: s.body || (s.wordCount != null ? 'kelime '.repeat(Math.max(0, s.wordCount)).trim() : ''),
        contentHash: null as string | null,
        role: (i === 0 ? 'PRIMARY' : 'SUPPORTING') as 'PRIMARY' | 'SUPPORTING',
        usedRssSnippet: false,
        htmlStripped: false,
      })),
    }
    const metrics = computeSourceContentMetrics(pack)
    usable = metrics.usableSourceWords
    richness = metrics.richness
    requiredMin = metrics.bodyRequiredMinWords
  }

  let code: DraftQualityCode = DRAFT_QUALITY.OK

  if (requiredMin != null && bodyWords < requiredMin) {
    code = DRAFT_QUALITY.QUALITY_WARNING
    reasonsTr.push(
      `Gövde ${bodyWords} kelime; kaynak politikası minimumu ${requiredMin} (sınıf: ${richness || '—'}).`
    )
  } else if (usable != null && usable >= CANARY_BODY_TARGET_MIN_WORDS && bodyWords < CANARY_BODY_TARGET_MIN_WORDS) {
    code = DRAFT_QUALITY.QUALITY_WARNING
    reasonsTr.push(
      `Kaynak materyali yeterli (${usable} kelime); gövde ${bodyWords} < ${CANARY_BODY_TARGET_MIN_WORDS}.`
    )
  } else if (bodyWords > 0 && bodyWords < CANARY_BODY_TARGET_MIN_WORDS) {
    // Historical / medium-valid drafts below normal band — editorial attention, not delete
    code = DRAFT_QUALITY.QUALITY_WARNING
    reasonsTr.push(
      `Gövde ${bodyWords} kelime — normal hedef bandının (${CANARY_BODY_TARGET_MIN_WORDS}–${CANARY_BODY_TARGET_MAX_WORDS}) altında.`
    )
  }

  if (bodyWords > CANARY_BODY_TARGET_MAX_WORDS) {
    code = DRAFT_QUALITY.QUALITY_WARNING
    reasonsTr.push(`Gövde ${bodyWords} kelime — üst sınır ${CANARY_BODY_TARGET_MAX_WORDS}.`)
  }

  return {
    code,
    labelTr: DRAFT_QUALITY_LABEL_TR[code],
    bodyWords,
    usableSourceWords: usable,
    richness,
    requiredMin,
    promptTargetMin: CANARY_BODY_PROMPT_TARGET_MIN_WORDS,
    promptTargetMax: CANARY_BODY_PROMPT_TARGET_MAX_WORDS,
    hardMin: CANARY_BODY_TARGET_MIN_WORDS,
    hardMax: CANARY_BODY_TARGET_MAX_WORDS,
    reasonsTr,
  }
}

export function formatAiCostUsd(actual: number | null | undefined): {
  display: string
  precise: string | null
} {
  if (actual == null || !Number.isFinite(actual)) return { display: '—', precise: null }
  const precise = `$${actual.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}`
  const display = `$${actual.toFixed(4)}`
  return { display, precise }
}
