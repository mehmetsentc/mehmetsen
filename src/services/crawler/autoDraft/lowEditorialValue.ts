/**
 * Phase 4F.4.2 — deterministic low editorial value detection (no LLM).
 * Blocks obvious filler from paid AI path; shadow shows WOULD_BLOCK, no deletion.
 */

import { looksLikeAstrologyContent } from '@/lib/categoryOverrides'

export const EDITORIAL_CONTENT_CLASSES = [
  'BREAKING_NEWS',
  'HARD_NEWS',
  'LOCAL_NEWS',
  'POLITICS',
  'ECONOMY',
  'WORLD',
  'SPORT',
  'TECH',
  'HEALTH',
  'CULTURE',
  'ENTERTAINMENT',
  'CELEBRITY',
  'LIFESTYLE',
  'ASTROLOGY',
  'EVERGREEN',
  'SEO_FILLER',
  'CLICKBAIT',
  'SERVICE_CONTENT',
  'OTHER',
] as const

export type EditorialContentClass = (typeof EDITORIAL_CONTENT_CLASSES)[number]

export type EditorialClassifyInput = {
  title?: string | null
  bodySnippet?: string | null
  normalizedTopic?: string | null
  city?: string | null
  importanceScore?: number | null
  editorialPriority?: string | null
  crawlPriority?: string | null
}

export type EditorialClassifyResult = {
  editorialClass: EditorialContentClass
  lowEditorialValue: boolean
  reason: string
}

const SEO_FILLER =
  /\b(en\s+iyi|top\s+\d+|işte\s+\d+|listesi|rehberi|nasıl\s+yapılır|faydaları|zararları|merak\s+edilen|bilmeniz\s+gereken|trend|viral|tiktok|instagram\s+fenomen)\b/i

const CLICKBAIT =
  /\b(şok\s+oldu|inanılmaz|görenler|hayrete|kim\s+seviyor|kimler\s+ayrıldı|flört|dedikodu|skandal|aşk\s+idaresi|gizli\s+aşk|fotoğrafları\s+ortaya)\b/i

const CELEBRITY_FILLER =
  /\b(ünlü|magazin|paparazzi|kırmızı\s+halı|kırmızı\s+halı|sevgilisi|eski\s+eşi|boşandı|evlendi|plajda|bikini|mayo\s+ile)\b/i

const EVERGREEN =
  /\b(her\s+zaman|asla\s+yapmayın|asla\s+yapmayın|unutmayın|bilgi\s+notu|genel\s+bilgiler|nedir\s*\?|ne\s+anlama\s+gelir)\b/i

const SERVICE_CONTENT =
  /\b(nöbetçi\s+eczane|namaz\s+vakitleri|trafik\s+yogunluk\s+haritası|hava\s+durumu\s+tahmini|burç\s+yorumları\s+sayfası)\b/i

const QUIZ_LISTICLE =
  /\b(quiz|testi|kaç\s+puan|hangi\s+.*\s?sensin|listicle|\d+\s+(madde|sebep|ipucu|öneri|fotoğraf))\b/i

const HARD_NEWS =
  /\b(son\s+dakika|deprem|sel|yangın|patlama|çöküş|kaza|facia|operasyon|gözaltı|tutuklandı|dava|mahkeme|cinayet|terör|saldırı|protesto|seçim|meclis|bakan|cumhurbaşkan|merkez\s+bankası|enflasyon|faiz|borsa|galibiyet|maç\s+sonucu)\b/i

const LOCAL_PUBLIC =
  /\b(belediye|il\s+müdürlüğü|valilik|kaymakamlık|mahalle|ilçe|köy|trafik\s+düzenlemesi|su\s+kesintisi|elektrik\s+kesintisi|yol\s+çalışması)\b/i

/** Deterministic editorial class for shadow economics audit (no LLM). */
export function classifyEditorialContentClass(input: EditorialClassifyInput): EditorialContentClass {
  const title = (input.title || '').trim()
  const topic = (input.normalizedTopic || '').trim()
  const snippet = (input.bodySnippet || '').slice(0, 2500)
  const text = `${title} ${topic} ${snippet}`.toLocaleLowerCase('tr-TR')
  const priority = (input.editorialPriority || input.crawlPriority || '').toUpperCase()

  if (priority === 'BREAKING' || /\bson\s+dakika\b/i.test(text)) return 'BREAKING_NEWS'
  if (looksLikeAstrologyContent(title, snippet)) return 'ASTROLOGY'
  if (SERVICE_CONTENT.test(text)) return 'SERVICE_CONTENT'
  if (SEO_FILLER.test(text) || QUIZ_LISTICLE.test(text)) return 'SEO_FILLER'
  if (CLICKBAIT.test(text)) return 'CLICKBAIT'
  if (CELEBRITY_FILLER.test(text) && !HARD_NEWS.test(text)) return 'CELEBRITY'
  if (EVERGREEN.test(text) && !HARD_NEWS.test(text)) return 'EVERGREEN'
  if (/\b(futbol|basketbol|voleybol|spor|maç|lig|şampiyon)\b/i.test(text)) return 'SPORT'
  if (/\b(teknoloji|yapay\s+zeka|iphone|android|yazılım|siber)\b/i.test(text)) return 'TECH'
  if (/\b(sağlık|hastane|doktor|aşı|virüs|hastalık)\b/i.test(text)) return 'HEALTH'
  if (/\b(sinema|tiyatro|konser|festival|kitap|sanat)\b/i.test(text)) return 'CULTURE'
  if (/\b(dizi|film|oyuncu|sanatçı)\b/i.test(text) && !HARD_NEWS.test(text)) return 'ENTERTAINMENT'
  if (/\b(ekonomi|borsa|dolar|euro|enflasyon|faiz|işsizlik|ihracat)\b/i.test(text)) return 'ECONOMY'
  if (/\b(siyaset|parti|milletvekili|seçim|tbmm|hükümet|opozisyon)\b/i.test(text)) return 'POLITICS'
  if (/\b(dünya|abd|rusya|ukrayna|israil|filistin|avrupa\s+birliği)\b/i.test(text)) return 'WORLD'
  if (HARD_NEWS.test(text)) return 'HARD_NEWS'
  if (input.city || LOCAL_PUBLIC.test(text)) return 'LOCAL_NEWS'
  if (/\b(yemek|tarif|moda|dekorasyon|yaşam|iliski|ilişki)\b/i.test(text)) return 'LIFESTYLE'
  return 'OTHER'
}

/**
 * Conservative low-value gate — blocks obvious filler, retains hard/local/public interest.
 * Never uses LLM. Does not mutate editorial fields.
 */
export function evaluateLowEditorialValue(input: EditorialClassifyInput): EditorialClassifyResult {
  const editorialClass = classifyEditorialContentClass(input)
  const title = (input.title || '').trim()
  const snippet = (input.bodySnippet || '').slice(0, 2500)
  const priority = (input.editorialPriority || input.crawlPriority || '').toUpperCase()

  // Always retain breaking / hard news / local public interest
  if (priority === 'BREAKING') {
    return { editorialClass, lowEditorialValue: false, reason: 'breaking_priority' }
  }
  if (editorialClass === 'BREAKING_NEWS' || editorialClass === 'HARD_NEWS') {
    return { editorialClass, lowEditorialValue: false, reason: 'hard_news_retained' }
  }
  if (editorialClass === 'LOCAL_NEWS' && HARD_NEWS.test(`${title} ${snippet}`)) {
    return { editorialClass, lowEditorialValue: false, reason: 'local_public_interest' }
  }
  if (
    editorialClass === 'POLITICS' ||
    editorialClass === 'ECONOMY' ||
    editorialClass === 'WORLD' ||
    editorialClass === 'SPORT' ||
    editorialClass === 'HEALTH' ||
    editorialClass === 'TECH'
  ) {
    return { editorialClass, lowEditorialValue: false, reason: 'substantive_news_retained' }
  }

  if (editorialClass === 'ASTROLOGY') {
    return { editorialClass, lowEditorialValue: true, reason: 'astrology_horoscope' }
  }
  if (editorialClass === 'SEO_FILLER' || editorialClass === 'CLICKBAIT') {
    return { editorialClass, lowEditorialValue: true, reason: 'seo_or_clickbait_filler' }
  }
  if (editorialClass === 'EVERGREEN' && (input.importanceScore ?? 0) < 55) {
    return { editorialClass, lowEditorialValue: true, reason: 'evergreen_low_importance' }
  }
  if (editorialClass === 'CELEBRITY' && (input.importanceScore ?? 0) < 50 && !HARD_NEWS.test(`${title} ${snippet}`)) {
    return { editorialClass, lowEditorialValue: true, reason: 'celebrity_filler' }
  }
  if (editorialClass === 'SERVICE_CONTENT') {
    return { editorialClass, lowEditorialValue: true, reason: 'service_utility_content' }
  }
  if (editorialClass === 'LIFESTYLE' && (input.importanceScore ?? 0) < 45 && SEO_FILLER.test(`${title} ${snippet}`)) {
    return { editorialClass, lowEditorialValue: true, reason: 'lifestyle_seo_filler' }
  }

  return { editorialClass, lowEditorialValue: false, reason: 'not_low_value' }
}
