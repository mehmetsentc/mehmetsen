/**
 * Lightweight category hint from raw text — used for CMS auto-routing
 * before full AI category classification. Not a replacement for categoryEngine.
 */

import { extractCityFromText } from '@/services/newsroom/geoEngine'
import {
  DISTRICT_TO_PROVINCE_SLUG,
  extractDistrictSlugFromText,
  extractProvinceDistrictPairFromText,
  normalizeCitySlug,
} from '@/constants/cities'
import { resolveCountryFromText } from '@/constants/countries'
import { slugifyCity } from '@/lib/location'
import {
  isNeverLocalNationalCategory,
  shouldStripSuggestedCityForCategory,
} from '@/lib/news/neverLocalVerticals'

export interface CategoryHint {
  categoryId: string
  confidence: number
  reason: string
  citySlug?: string
  districtSlug?: string
  countrySlug?: string
  secondaryCategoryId?: string
}

function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

export function extractDistrictSlug(normalized: string): string | null {
  return extractDistrictSlugFromText(normalized)
}

const RULES: Array<{ categoryId: string; confidence: number; patterns: RegExp[]; reason: string }> = [
  {
    categoryId: 'futbol',
    confidence: 0.95,
    reason: 'spor/futbol sinyali',
    patterns: [
      /\bfenerbahce\b/,
      /\bgalatasaray\b/,
      /\bbesiktas\b/,
      /\btrabzonspor\b/,
      /\btransfer\b/,
      /\bmac\b/,
      /\bsuper lig\b/,
      /\buefa\b/,
      /\bfifa\b/,
    ],
  },
  {
    categoryId: 'spor',
    confidence: 0.85,
    reason: 'spor sinyali',
    patterns: [/\bbasketbol\b/, /\bvoleybol\b/, /\bolimpiyat\b/, /\bmilli takim\b/],
  },
  {
    categoryId: 'ekonomi',
    confidence: 0.94,
    reason: 'ekonomi/finans sinyali',
    patterns: [
      /\btcmb\b/,
      /\bmerkez bankasi\b/,
      /\bfaiz\b/,
      /\benflasyon\b/,
      /\busd\b/,
      /\bdolar\b/,
      /\beuro\b/,
      /\bborsa\b/,
      /\bbist\b/,
      /\bbitcoin\b/,
      /\bkripto\b/,
    ],
  },
  {
    categoryId: 'teknoloji',
    confidence: 0.93,
    reason: 'teknoloji sinyali',
    patterns: [
      /\bapple\b/,
      /\biphone\b/,
      /\bgoogle\b/,
      /\bopenai\b/,
      /\bmicrosoft\b/,
      /\bmeta\b/,
      /\byapay zeka\b/,
      /\bchatgpt\b/,
      /\bsamsung\b/,
    ],
  },
  {
    categoryId: 'siyaset',
    confidence: 0.92,
    reason: 'politika sinyali',
    patterns: [
      /\bchp\b/,
      /\bakp\b/,
      /\bmhp\b/,
      /\biyiparti\b/,
      /\btbmm\b/,
      /\bcumhurbaskani\b/,
      /\bparti genel baskani\b/,
      /\bmilletvekili\b/,
      /\bsecim\b/,
      /\bkabine\b/,
    ],
  },
  {
    categoryId: 'saglik',
    confidence: 0.9,
    reason: 'sağlık sinyali',
    patterns: [/\bkanser\b/, /\bhastane\b/, /\bsaglik bakanligi\b/, /\basi\b/, /\btedavi\b/, /\bara[sş]tirma\b.*\btedavi/],
  },
  {
    categoryId: 'bilim',
    confidence: 0.88,
    reason: 'bilim sinyali',
    patterns: [/\bnasa\b/, /\buzay\b/, /\bfizik\b/, /\bbilim insan\b/, /\bdergi\b.*\bara[sş]tirma/],
  },
  {
    categoryId: 'otomobil',
    confidence: 0.9,
    reason: 'otomobil sinyali',
    patterns: [/\btogg\b/, /\belektrikli arac\b/, /\botomobil\b/, /\bwltp\b/, /\btesla\b/],
  },
  {
    categoryId: 'egitim',
    confidence: 0.9,
    reason: 'eğitim sinyali',
    patterns: [/\bmeb\b/, /\byok\b/, /\byks\b/, /\blgs\b/, /\buniversite\b/, /\bokul\b/],
  },
  {
    categoryId: 'magazin',
    confidence: 0.85,
    reason: 'magazin sinyali',
    patterns: [/\bunlu\b/, /\bdizi\b/, /\bmagazin\b/, /\bkirmizi hali\b/],
  },
  {
    categoryId: 'cevre-iklim',
    confidence: 0.88,
    reason: 'çevre/iklim sinyali',
    patterns: [/\borman yangin/, /\byangin\w*/, /\biklim\b/, /\bkirlilik\b/, /\bafad\b/],
  },
  {
    categoryId: 'dunya',
    confidence: 0.85,
    reason: 'dünya sinyali',
    patterns: [/\bnato\b/, /\bbm\b/, /\bab\b/, /\bukrayna\b/, /\bgazza\b/, /\bwhite house\b/, /\breuters\b/],
  },
  {
    categoryId: 'turizm',
    confidence: 0.82,
    reason: 'turizm sinyali',
    patterns: [/\bturizm\b/, /\botel\b/, /\btatil\b/, /\bhavayolu\b/, /\bbozcaada\b.*\bsezon/],
  },
]

const LOCAL_EVENT =
  /\b(yangin\w*|deprem\w*|sel\b|su baskini|belediye|valilik|kaymakam|feribot|trafik|kaza|tahliye|jandarma|emniyet)/

const NATIONAL_BREAKING =
  /\b(buyuk deprem|ulusal olcek|can kaybi|olumcul)\b/

/**
 * Infer a likely NaHaber categoryId from raw CMS paste text.
 */
export function hintCategoryFromText(raw: string): CategoryHint | null {
  const text = raw.trim()
  if (text.length < 12) return null
  const normalized = normalizeTr(text)

  const pair = extractProvinceDistrictPairFromText(text)
  const districtSlug = pair?.districtSlug ?? extractDistrictSlug(normalized)
  const cityName = pair
    ? null
    : extractCityFromText(text)
  const citySlug = pair
    ? pair.provinceSlug
    : cityName
      ? normalizeCitySlug(slugifyCity(cityName))
      : districtSlug
        ? DISTRICT_TO_PROVINCE_SLUG[districtSlug]
        : undefined
  const countryHit = resolveCountryFromText(text)
  const countrySlug = countryHit && countryHit.name !== 'Türkiye' ? countryHit.slug : undefined
  // Yurt dışı güçlü sinyal: ülke bulundu + Türk şehri yok → dünya
  if (countrySlug && !citySlug) {
    return {
      categoryId: 'dunya',
      confidence: 0.9,
      reason: `ülke tespit: ${countryHit!.name}`,
      countrySlug,
    }
  }
  const isLocalEvent = LOCAL_EVENT.test(normalized) && Boolean(citySlug || districtSlug)
  const isNationalMajor = NATIONAL_BREAKING.test(normalized)

  // Local + disaster: primary desk is Yerel; secondary may be Çevre (router).
  if (isLocalEvent && !isNationalMajor) {
    const secondary =
      /\byangin\w*|\biklim\b|\bafad\b|\borman\b/.test(normalized) ? 'cevre-iklim' : undefined
    return {
      categoryId: 'yerel-haber',
      confidence: 0.92,
      reason: 'yerel konum + olay sinyali',
      citySlug: citySlug || undefined,
      districtSlug: districtSlug || undefined,
      secondaryCategoryId: secondary,
    }
  }

  // Location + wildfire without other national desk: still local-first.
  if (
    !isNationalMajor &&
    (citySlug || districtSlug) &&
    /\byangin\w*/.test(normalized)
  ) {
    return {
      categoryId: 'yerel-haber',
      confidence: 0.9,
      reason: 'yerel konum + yangın',
      citySlug: citySlug || undefined,
      districtSlug: districtSlug || undefined,
      secondaryCategoryId: 'cevre-iklim',
    }
  }

  if (isNationalMajor) {
    return {
      categoryId: 'son-dakika',
      confidence: 0.8,
      reason: 'ulusal ölçekli acil olay',
      citySlug: citySlug || undefined,
      districtSlug: districtSlug || undefined,
      secondaryCategoryId: citySlug ? 'yerel-haber' : undefined,
    }
  }

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(normalized))) {
      const attachCity =
        !shouldStripSuggestedCityForCategory(rule.categoryId) &&
        !isNeverLocalNationalCategory(rule.categoryId)
      return {
        categoryId: rule.categoryId,
        confidence: rule.confidence,
        reason: rule.reason,
        // Tech/otomobil/sağlık/… — never attach weak TR city from "orta"/"genç"
        citySlug: attachCity ? citySlug || undefined : undefined,
        districtSlug: attachCity ? districtSlug || undefined : undefined,
        countrySlug:
          rule.categoryId === 'dunya' ? countrySlug || undefined : undefined,
      }
    }
  }

  if (citySlug || districtSlug) {
    return {
      categoryId: 'yerel-haber',
      confidence: 0.7,
      reason: 'konum tespit edildi',
      citySlug: citySlug || undefined,
      districtSlug: districtSlug || undefined,
    }
  }

  return null
}
