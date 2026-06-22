/**
 * STAGE 4 — Gate Keeper
 *
 * Tek sorumluluğu: Önceki 3 aşamanın çıktısını değerlendirip
 * "yayınla" / "taslağa al" / "atla" kararını vermek.
 *
 * Tamamen kural tabanlı — ek AI çağrısı gerektirmez.
 * Hızlı, güvenilir, tutarlı.
 */

import type { WrittenArticle } from './stage1_contentWriter'
import type { FactCheckResult } from './stage2_factChecker'
import type { CategoryResult } from './stage3_categoryEditor'

export type GateDecision = 'publish' | 'draft' | 'skip'

export interface GateResult {
  decision: GateDecision
  reasons: string[]
  /** Yayın için yeterli güven skoru (0-100) */
  publishScore: number
}

interface GateInput {
  written: WrittenArticle
  factCheck: FactCheckResult
  category: CategoryResult
  /** Son-dakika için ek kontrol — önceden hesaplanmış breaking score */
  breakingScore?: number
}

/**
 * Son-dakika kararı için ek güvenlik kapısı.
 * AI "son-dakika" dese bile bu kurallara uymak zorunda.
 */
function validateBreaking(
  category: CategoryResult,
  written: WrittenArticle,
): { allowed: boolean; reason: string } {
  if (category.categoryId !== 'son-dakika') {
    return { allowed: true, reason: '' }
  }

  const text = `${written.title} ${written.content}`.toLocaleLowerCase('tr-TR')

  // Gerçek son-dakika kriterleri
  const BREAKING_TRIGGERS = [
    { pattern: /deprem.*[4-9]\.[0-9]|[4-9]\.[0-9].*deprem/, reason: '4.5+ deprem' },
    { pattern: /darbe girişimi|darbe teşebbüs|darbesi/, reason: 'darbe girişimi' },
    { pattern: /suikast|cumhurbaşkan.*saldırı|başbakan.*saldırı/, reason: 'suikast' },
    { pattern: /terör saldırısı|bombalı saldırı|canlı bomba/, reason: 'terör saldırısı' },
    { pattern: /olağanüstü hal ilan|seferberlik ilan/, reason: 'OHAL ilanı' },
    { pattern: /borsa devre kesici|dolar.*serbest düşüş|lira.*çöküş/, reason: 'kritik ekonomik çöküş' },
    { pattern: /onlarca kişi öldü|yüzlerce kişi.*hayat.*kaybetti|toplu tahliye/, reason: 'büyük afet' },
  ]

  // Non-breaking içerik — KESİNLİKLE son-dakika olamaz
  const NON_BREAKING_TRIGGERS = [
    { pattern: /kutlama|kutlandı|kutluyor/, reason: 'kutlama içeriği' },
    { pattern: /babalar günü|anneler günü|sevgililer günü|öğretmenler günü/, reason: 'özel gün kutlaması' },
    { pattern: /tören düzenlendi|anma töreni|mezuniyet töreni|açılış töreni/, reason: 'tören haberi' },
    { pattern: /şenlik|festival|konser.*düzenlendi/, reason: 'etkinlik haberi' },
    { pattern: /belediye.*park|belediye.*yol|belediye.*hizmet/, reason: 'belediye hizmet haberi' },
    { pattern: /belediye başkanı.*ziyaret|belediye başkanı.*açıkladı|belediye başkanı.*dedi/, reason: 'belediye başkanı açıklaması' },
  ]

  for (const { pattern, reason } of NON_BREAKING_TRIGGERS) {
    if (pattern.test(text)) {
      return { allowed: false, reason: `son-dakika reddedildi: ${reason}` }
    }
  }

  const hasTrigger = BREAKING_TRIGGERS.some(({ pattern }) => pattern.test(text))
  if (!hasTrigger) {
    return {
      allowed: false,
      reason: 'son-dakika kriterleri karşılanmıyor (deprem/darbe/suikast/terör/OHAL/büyük afet)',
    }
  }

  return { allowed: true, reason: 'geçerli son-dakika kriteri' }
}

export function gateKeep(input: GateInput): GateResult {
  const reasons: string[] = []
  let publishScore = 100

  // ── 1. Ham içerik — ASLA yayınlama ──────────────────────────────────────────
  if (!input.written.aiWritten) {
    return {
      decision: 'draft',
      reasons: ['AI içerik üretemedi — ham RSS fallback taslağa alındı'],
      publishScore: 0,
    }
  }

  // ── 2. Teknik içerik (HTML/JSON sızdı) — atla ────────────────────────────────
  if (input.factCheck.flags.some((f) => f.includes('teknik içerik'))) {
    return {
      decision: 'skip',
      reasons: ['teknik içerik (HTML/JSON) tespit edildi — haber atlandı'],
      publishScore: 0,
    }
  }

  // ── 3. İçerik kalite ─────────────────────────────────────────────────────────
  if (input.factCheck.shortContent) {
    publishScore -= 30
    reasons.push('içerik çok kısa')
  }

  if (input.factCheck.titleMismatch) {
    publishScore -= 20
    reasons.push('başlık-içerik uyumsuzluğu')
  }

  // ── 4. Fact check skoru ───────────────────────────────────────────────────────
  if (input.factCheck.score < 30) {
    publishScore -= 40
    reasons.push(`fact-check skoru çok düşük: ${input.factCheck.score}`)
  } else if (input.factCheck.score < 50) {
    publishScore -= 20
    reasons.push(`fact-check skoru düşük: ${input.factCheck.score}`)
  }

  // ── 5. Kategori güveni ────────────────────────────────────────────────────────
  if (input.category.confidence < 40) {
    publishScore -= 15
    reasons.push(`kategori güveni düşük: ${input.category.confidence}`)
  }

  // ── 6. Son-dakika güvenlik kapısı ────────────────────────────────────────────
  if (input.category.categoryId === 'son-dakika') {
    const breakingValidation = validateBreaking(input.category, input.written)
    if (!breakingValidation.allowed) {
      // Son-dakika'yı reddet → gundem'e düşür (atlanmaz, sadece kategori değişir)
      reasons.push(`son-dakika → gundem: ${breakingValidation.reason}`)
      input.category.categoryId = 'gundem'
      input.category.isBreaking = false
    }
  }

  // ── 7. yerel-haber + isBreaking çakışma kontrolü ─────────────────────────────
  if (input.category.categoryId === 'yerel-haber' && input.category.isBreaking) {
    reasons.push('yerel-haber isBreaking düzeltildi → false')
    input.category.isBreaking = false
  }

  // ── Karar ─────────────────────────────────────────────────────────────────────
  publishScore = Math.max(0, Math.min(100, publishScore))

  const decision: GateDecision = publishScore >= 60 ? 'publish' : 'draft'

  if (decision === 'draft' && reasons.length === 0) {
    reasons.push(`publish skoru yetersiz: ${publishScore}`)
  }

  return { decision, reasons, publishScore }
}
