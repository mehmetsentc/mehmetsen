/**
 * Multi-Stage Editor Orchestrator
 *
 * 4 aşamalı AI editör zinciri:
 *   Stage 1: Content Writer  — ham RSS → profesyonel Türkçe haber
 *   Stage 2: Fact Checker    — kalite + tutarlılık kontrolü
 *   Stage 3: Category Editor — kategori + isBreaking + konum
 *   Stage 4: Gate Keeper     — yayınla / taslağa al / atla kararı
 *
 * Pipeline'ın beklediği AiRewriteResult formatına dönüştürür.
 */

import { writeArticle } from './stage1_contentWriter'
import { quickFactCheck } from './stage2_factChecker'
import { classifyArticle, type CategoryResult } from './stage3_categoryEditor'
import { gateKeep } from './stage4_gateKeeper'
import type { AiRewriteResult } from '@/services/aiNewsEditor'
import type { GenerationReason } from '@/lib/ai/usage/generationReason'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import { countPlainWords } from '@/lib/contentQuality'
import {
  attachStage1RetryOptimizationContext,
  normalizeQualityRetryTriggers,
} from '@/lib/ai/stage1RetryOptimization'
import { getAiUsageContext } from '@/lib/ai/usage/context'
import {
  cloneStage3Classification,
  recordStage3Reuse,
  shouldReuseStage3OnQualityRetry,
} from '@/lib/ai/stage3QualityRetryReuse'

export interface MultiStageInput {
  sourceLabel: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  sourceUrl: string
  forcedCategoryId?: string
  /** V2 persona context — optional */
  systemPromptOverride?: string
  userPromptOverride?: string
  writerModel?: string
  aiEditorId?: string
  /** Yeniden yazım: gate nedenleri */
  revisionHints?: string[]
  previousDraft?: { title: string; spot: string; content: string }
  generationReason?: GenerationReason
  retryTriggers?: string[]
  /** First successful DeepSeek Stage3 — reused only on quality_retry. */
  previousStage3?: CategoryResult
}

export interface MultiStageResult extends AiRewriteResult {
  /**
   * Gate keeper kararı.
   * 'publish' → pipeline otomatik yayınlar
   * 'draft'   → pipeline taslağa alır
   * 'skip'    → pipeline atlar (teknik içerik vs.)
   */
  gateDecision: 'publish' | 'draft' | 'skip'
  gateReasons: string[]
  publishScore: number
  aiEditorId?: string
  promptVersions?: Record<string, number>
  /** Pre-gateKeep Stage3 result. Heuristic fallback is not reused. */
  stage3Classification?: CategoryResult
}

export async function runMultiStageEditor(input: MultiStageInput): Promise<MultiStageResult> {
  const startMs = Date.now()
  console.log(`[multiStage] başlıyor: "${input.originalTitle.slice(0, 60)}"`)

  // ── Stage 1: Content Writer ──────────────────────────────────────────────────
  const written = await writeArticle({
    sourceLabel: input.sourceLabel,
    originalTitle: input.originalTitle,
    originalSummary: input.originalSummary,
    originalContent: input.originalContent,
    sourceUrl: input.sourceUrl,
    systemPromptOverride: input.systemPromptOverride,
    userPromptOverride: input.userPromptOverride,
    model: input.writerModel,
    revisionHints: input.revisionHints,
    previousDraft: input.previousDraft,
    generationReason: input.generationReason,
    retryTriggers: input.retryTriggers,
  })

  // ── Stage 2: Fact Checker ────────────────────────────────────────────────────
  const factCheck = quickFactCheck({
    original: {
      title: input.originalTitle,
      summary: input.originalSummary,
      content: input.originalContent,
    },
    written,
  })

  // ── Stage 3: Category Editor ─────────────────────────────────────────────────
  // quality_retry reuses the first successful DeepSeek classification.
  // Clone before gateKeep — gateKeep may mutate categoryId / isBreaking.
  let category: CategoryResult
  let stage3Classification: CategoryResult
  const previous = input.previousStage3
  if (
    shouldReuseStage3OnQualityRetry({
      generationReason: input.generationReason,
      previousStage3: previous,
    }) &&
    previous
  ) {
    stage3Classification = cloneStage3Classification(previous)
    category = cloneStage3Classification(stage3Classification)
    recordStage3Reuse({ category: stage3Classification, generationReason: input.generationReason })
    console.log(
      `[multiStage] Stage3 reuse (quality_retry): ${stage3Classification.categoryId}`
    )
  } else {
    category = await classifyArticle(written, input.sourceLabel, input.forcedCategoryId)
    stage3Classification = cloneStage3Classification(category)
  }

  // ── Stage 4: Gate Keeper ─────────────────────────────────────────────────────
  const gate = gateKeep({ written, factCheck, category })

  const durationMs = Date.now() - startMs
  console.log(
    `[multiStage] tamamlandı ${durationMs}ms: "${written.title.slice(0, 50)}" → ` +
    `${category.categoryId} | ${gate.decision} (skor: ${gate.publishScore}) | ` +
    `AI: ${written.aiWritten ? 'evet' : 'hayır'}`
  )

  if (gate.reasons.length > 0) {
    console.log(`[multiStage] gate notları: ${gate.reasons.join('; ')}`)
  }

  const cohort = attachStage1RetryOptimizationContext()
  const ctx = getAiUsageContext()
  recordAiRequestUsage({
    success: true,
    agentName: 'stage4_gate',
    operation: 'gate_keep',
    provider: 'heuristic',
    promptVariant: cohort === 'off' ? undefined : cohort,
    canaryBucket: ctx?.retryOptBucket,
    outputChars: written.content.length,
    outputWordCount: countPlainWords(written.content),
    gateDecision: gate.decision,
    publishScore: gate.publishScore,
    categoryConfidence: written.aiWritten ? category.confidence : 0,
    requiredFieldsPresent: Boolean(written.title && written.spot && written.summary && written.content),
    schemaValid: written.aiWritten,
    retryTriggers: normalizeQualityRetryTriggers({
      gateDecision: gate.decision,
      gateReasons: gate.reasons,
      publishScore: gate.publishScore,
      categoryConfidence: written.aiWritten ? category.confidence : 0,
      title: written.title,
      spot: written.spot,
      summary: written.summary,
      description: written.content,
      aiWritten: written.aiWritten,
      shortContent: factCheck.shortContent,
    }),
  })

  // ── AiRewriteResult'a dönüştür ───────────────────────────────────────────────
  const tags = [...category.tags]
  if (category.city) {
    const cityTag = category.city.toLocaleLowerCase('tr-TR').replace(/\s+/g, '-')
    if (!tags.includes(cityTag)) tags.unshift(cityTag)
  }

  return {
    // AiRewriteResult alanları
    title: written.title,
    spot: written.spot || written.summary,
    summary: written.summary,
    description: written.content,
    seoTitle: written.seoTitle,
    seoDescription: written.seoDescription,
    categoryId: category.categoryId,
    // categoryConfidence: 0 = ham fallback sinyali (pipeline bunu kontrol eder)
    categoryConfidence: written.aiWritten ? category.confidence : 0,
    isBreaking: category.isBreaking,
    city: category.city,
    district: category.district,
    country: category.country,
    tags,
    // Ekstra alanlar
    gateDecision: gate.decision,
    gateReasons: gate.reasons,
    publishScore: gate.publishScore,
    aiEditorId: input.aiEditorId,
    stage3Classification,
  }
}
