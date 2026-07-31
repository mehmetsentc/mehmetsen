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
import { classifyArticle } from './stage3_categoryEditor'
import { gateKeep } from './stage4_gateKeeper'
import type { AiRewriteResult } from '@/services/aiNewsEditor'

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
  const category = await classifyArticle(written, input.sourceLabel, input.forcedCategoryId)

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
  }
}
