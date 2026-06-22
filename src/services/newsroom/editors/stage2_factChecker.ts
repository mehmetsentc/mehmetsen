/**
 * STAGE 2 — Fact Checker / Quality Controller
 *
 * Tek sorumluluğu: Stage 1'in yazdığı içeriği kalite + tutarlılık açısından kontrol etmek.
 * - Başlık ile içerik örtüşüyor mu?
 * - İçerik kaynakla tutarlı mı?
 * - Minimum kalite standartlarını sağlıyor mu?
 *
 * NOT: Bu aşama mevcut factChecker.ts servisini TAMAMLAR — onu değiştirmez.
 * Mevcut factChecker.ts heuristik (keyword tabanlı), bu AI tabanlı.
 */

import type { WrittenArticle } from './stage1_contentWriter'

export interface FactCheckResult {
  score: number         // 0-100
  approved: boolean     // score >= 50
  flags: string[]       // sorun açıklamaları
  shortContent: boolean // content < 150 kelime
  titleMismatch: boolean
}

interface FactCheckInput {
  original: {
    title: string
    summary: string
    content: string
  }
  written: WrittenArticle
}

/**
 * Hızlı heuristik kalite kontrolü — AI çağrısı gerektirmez.
 * Temel sorunları yakalamak için yeterli.
 */
export function quickFactCheck(input: FactCheckInput): FactCheckResult {
  const flags: string[] = []
  const wordCount = input.written.content.split(/\s+/).filter(Boolean).length

  // İçerik uzunluğu
  const shortContent = wordCount < 80
  if (shortContent) flags.push(`içerik çok kısa: ${wordCount} kelime`)

  // Teknik içerik tespiti (HTML/JSON/React sızdı mı?)
  const techPatterns = [
    /__next_f/,
    /\{"className":/,
    /<div /i,
    /self\.__next/,
    /window\.__/,
    /React\.createElement/,
  ]
  const hasGarbage = techPatterns.some((p) => p.test(input.written.content))
  if (hasGarbage) flags.push('teknik içerik (HTML/JSON) tespit edildi')

  // Başlık-içerik örtüşmesi (basit kelime örtüşmesi)
  const titleWords = input.written.title
    .toLocaleLowerCase('tr-TR')
    .split(/\s+/)
    .filter((w) => w.length > 3)
  const contentLower = input.written.content.toLocaleLowerCase('tr-TR')
  const titleWordMatches = titleWords.filter((w) => contentLower.includes(w)).length
  const titleMismatch = titleWords.length > 2 && titleWordMatches / titleWords.length < 0.2
  if (titleMismatch) flags.push('başlık ile içerik örtüşmüyor')

  // Ham RSS işaretli mi?
  if (!input.written.aiWritten) flags.push('AI yazmadı — ham RSS içeriği')

  // AI üretmedi + kısa = çok düşük skor
  let score = 70
  if (!input.written.aiWritten) score -= 40
  if (shortContent) score -= 20
  if (hasGarbage) score -= 30
  if (titleMismatch) score -= 15
  score = Math.max(0, Math.min(100, score))

  return {
    score,
    approved: score >= 50 && !hasGarbage && input.written.aiWritten,
    flags,
    shortContent,
    titleMismatch,
  }
}
