import { TURKISH_PROVINCES } from '@/constants/cities'
import { PROVINCE_REGION_BY_SLUG } from '../provinceRegions'
import type { InsertSourceInput } from '../store/types'
import type { CrawlerSourceStatus, NewsSourceRecord } from '../types'

/**
 * SONDAKIKA-81: sondakika.com il sayfaları — 81 ayrı LISTING kaynağı.
 *
 * Neden 81 kaynak: discoverSource kaynak başına en fazla 3 liste URL'si okur ve
 * il bazlı sağlık/zamanlama kaynak başına tutulur.
 *
 * Kadans: il sayfası 30-76 haber tutuyor (en yoğun il ≈ 40 haber/gün), 6 saatte bir
 * okumak hiçbir haberi kaçırmaz ve 30 dk'lık turda ortalama ~7 il sayfası eder.
 * Öncelik 50 (NORMAL bant): canlıda 30 bandındaki kaynaklar hiç sıra bulamıyor
 * (15.11.2026: 50 bandında 92 kaynağın sırası hep gelmiş, tur 25 kaynak alıyor → 30 bandı
 * ~88 gündür taranmamış). Fetch tarafında crawlPriority LOW + domain kotası korunur.
 * Haber çekme kotası ayrıca domain bazında sınırlı (SONDAKIKA_DOMAIN / scheduler).
 */

export const SONDAKIKA_DOMAIN = 'sondakika.com'
export const SONDAKIKA_BASE_URL = 'https://www.sondakika.com'
export const SONDAKIKA_REGISTRY_PREFIX = 'sondakika-il-'
export const SONDAKIKA_CITY_CRAWL_INTERVAL_SECONDS = 6 * 60 * 60
export const SONDAKIKA_CITY_PRIORITY = 50

export function sondakikaCityListingUrl(provinceSlug: string): string {
  return `${SONDAKIKA_BASE_URL}/${provinceSlug}/`
}

export function isSondakikaCitySource(
  source: Pick<NewsSourceRecord, 'registryKey' | 'domain'> | null | undefined
): boolean {
  if (!source) return false
  return (
    (source.domain || '').toLowerCase().replace(/^www\./, '') === SONDAKIKA_DOMAIN &&
    Boolean(source.registryKey?.startsWith(SONDAKIKA_REGISTRY_PREFIX))
  )
}

export function sondakikaCitySourceInputs(status: CrawlerSourceStatus = 'PAUSED'): InsertSourceInput[] {
  return TURKISH_PROVINCES.map((p) => ({
    name: `Sondakika.com · ${p.name}`,
    domain: SONDAKIKA_DOMAIN,
    baseUrl: SONDAKIKA_BASE_URL,
    countryCode: 'TR',
    countryName: 'Türkiye',
    region: PROVINCE_REGION_BY_SLUG[p.slug] ?? null,
    city: p.name,
    district: null,
    language: 'tr',
    timezone: 'Europe/Istanbul',
    sourceType: 'LOCAL',
    status,
    priority: SONDAKIKA_CITY_PRIORITY,
    trustTier: 3,
    discoveryMethod: 'LISTING',
    rssUrls: [],
    sitemapUrls: [],
    listingUrls: [sondakikaCityListingUrl(p.slug)],
    crawlIntervalSeconds: SONDAKIKA_CITY_CRAWL_INTERVAL_SECONDS,
    articleFetchMode: 'HTTP',
    robotsPolicy: 'FOLLOW',
    geographicScope: 'CITY',
    sourceCategory: 'LOCAL',
    crawlPriority: 'LOW',
    qualityTier: 'UNTESTED',
    freshnessHours: 48,
    registryKey: `${SONDAKIKA_REGISTRY_PREFIX}${p.slug}`,
    lastPauseReason: status === 'PAUSED' ? 'sondakika_81_seed_paused' : null,
  }))
}
