/**
 * Phase 4C.2 — deterministic source-aware body policy (no AI classifier).
 * Rich sources → full article target. Thin → accurate shorter or insufficient.
 */

import {
  CANARY_BODY_ABSOLUTE_MIN_WORDS,
  CANARY_BODY_PROMPT_TARGET_MAX_WORDS,
  CANARY_BODY_PROMPT_TARGET_MIN_WORDS,
  CANARY_BODY_TARGET_MAX_WORDS,
  CANARY_BODY_TARGET_MIN_WORDS,
  CANARY_BODY_THIN_MIN_WORDS,
  wordCount,
} from './schema'
import type { CanaryEvidencePack, CanaryPackedSource } from './types'

export type SourceRichness = 'rich' | 'medium' | 'thin' | 'insufficient'

export type SourceContentMetrics = {
  usableSourceWords: number
  sourceCount: number
  independentSourceCount: number
  /** Approx unique factual density: unique tokens / usable words (0–1). */
  uniqueFactDensity: number
  richness: SourceRichness
  /** Soft target min when writing; null if insufficient. */
  bodyTargetMinWords: number | null
  bodyTargetMaxWords: number
  /** Prompt aim band for rich packs (does not replace hard 300–900). */
  bodyPromptTargetMinWords: number | null
  bodyPromptTargetMaxWords: number | null
  /** Hard validation min for body length given sources. */
  bodyRequiredMinWords: number | null
  /** When true, validation should fail with INSUFFICIENT_SOURCE_MATERIAL. */
  insufficient: boolean
}

function uniqueTokenRatio(text: string): number {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3)
  if (tokens.length === 0) return 0
  return new Set(tokens).size / tokens.length
}

export function computeSourceContentMetrics(
  pack: Pick<CanaryEvidencePack, 'sources'> | { sources: CanaryPackedSource[] }
): SourceContentMetrics {
  const sources = pack.sources || []
  const sourceCount = sources.length
  const independentSourceCount = new Set(sources.map((s) => s.sourceId)).size
  const usableSourceWords = sources.reduce((acc, s) => acc + wordCount(s.body || ''), 0)
  const combined = sources.map((s) => s.body || '').join(' ')
  const uniqueFactDensity = Math.round(uniqueTokenRatio(combined) * 1000) / 1000

  let richness: SourceRichness
  if (usableSourceWords < 80 || sourceCount === 0) {
    richness = 'insufficient'
  } else if (usableSourceWords >= 400 && independentSourceCount >= 2) {
    richness = 'rich'
  } else if (usableSourceWords >= 220 || (usableSourceWords >= 150 && independentSourceCount >= 2)) {
    richness = 'medium'
  } else {
    richness = 'thin'
  }

  const bodyTargetMaxWords = CANARY_BODY_TARGET_MAX_WORDS

  if (richness === 'insufficient') {
    return {
      usableSourceWords,
      sourceCount,
      independentSourceCount,
      uniqueFactDensity,
      richness,
      bodyTargetMinWords: null,
      bodyTargetMaxWords,
      bodyPromptTargetMinWords: null,
      bodyPromptTargetMaxWords: null,
      bodyRequiredMinWords: null,
      insufficient: true,
    }
  }

  if (richness === 'rich') {
    return {
      usableSourceWords,
      sourceCount,
      independentSourceCount,
      uniqueFactDensity,
      richness,
      bodyTargetMinWords: CANARY_BODY_TARGET_MIN_WORDS,
      bodyTargetMaxWords,
      bodyPromptTargetMinWords: CANARY_BODY_PROMPT_TARGET_MIN_WORDS,
      bodyPromptTargetMaxWords: CANARY_BODY_PROMPT_TARGET_MAX_WORDS,
      bodyRequiredMinWords: CANARY_BODY_TARGET_MIN_WORDS,
      insufficient: false,
    }
  }

  if (richness === 'medium') {
    const required = Math.min(
      CANARY_BODY_TARGET_MIN_WORDS,
      Math.max(CANARY_BODY_THIN_MIN_WORDS, Math.floor(usableSourceWords * 0.55))
    )
    return {
      usableSourceWords,
      sourceCount,
      independentSourceCount,
      uniqueFactDensity,
      richness,
      bodyTargetMinWords: required,
      bodyTargetMaxWords,
      bodyPromptTargetMinWords: required,
      bodyPromptTargetMaxWords: Math.min(bodyTargetMaxWords, Math.max(required + 150, 400)),
      bodyRequiredMinWords: required,
      insufficient: false,
    }
  }

  // thin: accuracy > length; allow short accurate drafts above absolute floor band
  const thinRequired = Math.min(
    CANARY_BODY_THIN_MIN_WORDS,
    Math.max(CANARY_BODY_ABSOLUTE_MIN_WORDS, Math.floor(usableSourceWords * 0.7))
  )
  return {
    usableSourceWords,
    sourceCount,
    independentSourceCount,
    uniqueFactDensity,
    richness,
    bodyTargetMinWords: thinRequired,
    bodyTargetMaxWords: Math.min(bodyTargetMaxWords, Math.max(thinRequired + 100, usableSourceWords)),
    bodyPromptTargetMinWords: thinRequired,
    bodyPromptTargetMaxWords: Math.min(bodyTargetMaxWords, Math.max(thinRequired + 100, usableSourceWords)),
    bodyRequiredMinWords: thinRequired,
    insufficient: false,
  }
}

export type BodyLengthDecision = {
  ok: boolean
  code: 'OK' | 'BODY_TOO_SHORT' | 'BODY_TOO_LONG' | 'INSUFFICIENT_SOURCE_MATERIAL' | 'BODY_ABSOLUTE_TOO_SHORT'
  messageTr: string
  words: number
  requiredMin: number | null
  metrics: SourceContentMetrics
}

/**
 * Validate body length against source-aware policy.
 * Distinguishes truncated/broken (absolute floor) vs under-delivery on rich packs vs thin-ok.
 */
export function evaluateBodyAgainstSources(
  body: string,
  pack: Pick<CanaryEvidencePack, 'sources'> | { sources: CanaryPackedSource[] }
): BodyLengthDecision {
  const metrics = computeSourceContentMetrics(pack)
  const words = wordCount(body || '')

  if (metrics.insufficient) {
    return {
      ok: false,
      code: 'INSUFFICIENT_SOURCE_MATERIAL',
      messageTr: 'Kaynak materyali yetersiz — uydurarak doldurma yasak; AI retry yok.',
      words,
      requiredMin: null,
      metrics,
    }
  }

  if (words < CANARY_BODY_ABSOLUTE_MIN_WORDS) {
    return {
      ok: false,
      code: 'BODY_ABSOLUTE_TOO_SHORT',
      messageTr: `Gövde kırık/çok kısa (<${CANARY_BODY_ABSOLUTE_MIN_WORDS} kelime) — üretim hatası veya kesilme olabilir.`,
      words,
      requiredMin: CANARY_BODY_ABSOLUTE_MIN_WORDS,
      metrics,
    }
  }

  const required = metrics.bodyRequiredMinWords ?? CANARY_BODY_ABSOLUTE_MIN_WORDS
  if (words < required) {
    return {
      ok: false,
      code: 'BODY_TOO_SHORT',
      messageTr:
        metrics.richness === 'rich'
          ? `Kaynaklar yeterli (${metrics.usableSourceWords} kelime); gövde en az ${required} kelime olmalı (uydurma yasak).`
          : `Gövde en az ${required} kelime olmalı (kaynak sınıfı: ${metrics.richness}; uydurma yasak).`,
      words,
      requiredMin: required,
      metrics,
    }
  }

  if (words > CANARY_BODY_TARGET_MAX_WORDS) {
    return {
      ok: false,
      code: 'BODY_TOO_LONG',
      messageTr: `Gövde en fazla ${CANARY_BODY_TARGET_MAX_WORDS} kelime olmalı.`,
      words,
      requiredMin: required,
      metrics,
    }
  }

  return {
    ok: true,
    code: 'OK',
    messageTr: 'Gövde uzunluğu kaynak politikasına uygun.',
    words,
    requiredMin: required,
    metrics,
  }
}
