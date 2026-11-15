import type { InsertSourceInput } from '../store/types'
import type { CrawlerSourceStatus, NewsSourceRecord } from '../types'

/**
 * TOURISM-SRC-1: turizm haber kaynakları (crawler / Neon `news_sources`).
 *
 * Neden burada: newsroom `turizmWorker` cron'u FinOps sonrası vercel.json'da yok ve
 * `rss/sources.ts`'teki turizm adreslerinin çoğu bozuk. Crawler turu (30 dk) zaten çalışıyor.
 *
 * Her adres 15.11.2026'da hem RSS hem haber sayfası çıkarımıyla canlı test edildi
 * (claude/rapor-turizm-kaynaklari.md). Alınamayanlar bilinçli olarak yok:
 * Turizm Gazetesi (RSS yok, 415), Hospitality Net (makale 403), NTV seyahat (/yasam'a
 * yönleniyor), PhocusWire/TravelPulse/Travel Weekly US/UN Tourism/WTTC (403/415).
 */

export const TOURISM_REGISTRY_PREFIX = 'turizm-'

interface TourismSourceDef {
  key: string
  name: string
  domain: string
  baseUrl: string
  rssUrl: string
  language: 'tr' | 'en'
  countryCode: string
  countryName: string
  freshnessHours?: number
}

export const TOURISM_SOURCES: readonly TourismSourceDef[] = [
  // Türkiye — turizm sektör yayınları
  { key: 'turizmajansi', name: 'Turizm Ajansı', domain: 'turizmajansi.com', baseUrl: 'https://www.turizmajansi.com', rssUrl: 'https://www.turizmajansi.com/rss', language: 'tr', countryCode: 'TR', countryName: 'Türkiye' },
  { key: 'turizmnews', name: 'Turizm News', domain: 'turizmnews.com', baseUrl: 'https://www.turizmnews.com', rssUrl: 'https://www.turizmnews.com/rss', language: 'tr', countryCode: 'TR', countryName: 'Türkiye' },
  { key: 'turizmekonomi', name: 'Turizm Ekonomi', domain: 'turizmekonomi.com', baseUrl: 'https://www.turizmekonomi.com', rssUrl: 'https://www.turizmekonomi.com/rss', language: 'tr', countryCode: 'TR', countryName: 'Türkiye' },
  { key: 'turizmguncel', name: 'Turizm Güncel', domain: 'turizmguncel.com', baseUrl: 'https://www.turizmguncel.com', rssUrl: 'https://www.turizmguncel.com/rss.xml', language: 'tr', countryCode: 'TR', countryName: 'Türkiye' },
  { key: 'tourismtoday', name: 'Tourism Today', domain: 'tourismtoday.net', baseUrl: 'https://www.tourismtoday.net', rssUrl: 'https://www.tourismtoday.net/feed/', language: 'tr', countryCode: 'TR', countryName: 'Türkiye' },
  { key: 'haberler-turizm', name: 'Haberler.com Turizm', domain: 'haberler.com', baseUrl: 'https://www.haberler.com', rssUrl: 'https://rss.haberler.com/RssNew.aspx?kategori=turizm', language: 'tr', countryCode: 'TR', countryName: 'Türkiye' },
  // Global — seyahat/turizm sektörü
  { key: 'skift', name: 'Skift', domain: 'skift.com', baseUrl: 'https://skift.com', rssUrl: 'https://skift.com/feed/', language: 'en', countryCode: 'US', countryName: 'United States' },
  { key: 'breakingtravelnews', name: 'Breaking Travel News', domain: 'breakingtravelnews.com', baseUrl: 'https://www.breakingtravelnews.com', rssUrl: 'https://feeds.feedburner.com/breakingtravelnews', language: 'en', countryCode: 'GB', countryName: 'United Kingdom' },
  { key: 'traveldailynews', name: 'Travel Daily News', domain: 'traveldailynews.com', baseUrl: 'https://www.traveldailynews.com', rssUrl: 'https://www.traveldailynews.com/feed/', language: 'en', countryCode: 'GR', countryName: 'Greece' },
  { key: 'traveldailynews-asia', name: 'Travel Daily News Asia', domain: 'traveldailynews.asia', baseUrl: 'https://www.traveldailynews.asia', rssUrl: 'https://www.traveldailynews.asia/feed/', language: 'en', countryCode: 'GR', countryName: 'Greece' },
  { key: 'euronews-travel', name: 'Euronews Travel', domain: 'euronews.com', baseUrl: 'https://www.euronews.com', rssUrl: 'https://www.euronews.com/rss?level=vertical&name=travel', language: 'en', countryCode: 'FR', countryName: 'France' },
  { key: 'tourism-review', name: 'Tourism Review', domain: 'tourism-review.com', baseUrl: 'https://www.tourism-review.com', rssUrl: 'http://www.tourism-review.com/weekly-news.rss', language: 'en', countryCode: 'CZ', countryName: 'Czechia', freshnessHours: 168 },
  { key: 'simpleflying', name: 'Simple Flying', domain: 'simpleflying.com', baseUrl: 'https://simpleflying.com', rssUrl: 'https://simpleflying.com/feed/', language: 'en', countryCode: 'US', countryName: 'United States' },
]

export function isTourismSource(source: Pick<NewsSourceRecord, 'sourceCategory'> | null | undefined): boolean {
  return source?.sourceCategory === 'TOURISM'
}

export function tourismSourceInputs(status: CrawlerSourceStatus = 'PAUSED'): InsertSourceInput[] {
  return TOURISM_SOURCES.map((s) => {
    const global = s.countryCode !== 'TR'
    return {
      name: s.name,
      domain: s.domain,
      baseUrl: s.baseUrl,
      countryCode: s.countryCode,
      countryName: s.countryName,
      region: null,
      city: null,
      district: null,
      language: s.language,
      sourceType: global ? 'INTERNATIONAL' : 'NATIONAL',
      status,
      // TR sektör yayınları NORMAL, global LOW: mevcut gündem kaynaklarının önüne geçmez.
      priority: global ? 30 : 50,
      crawlPriority: global ? 'LOW' : 'NORMAL',
      trustTier: 3,
      discoveryMethod: 'RSS',
      rssUrls: [s.rssUrl],
      sitemapUrls: [],
      listingUrls: [],
      crawlIntervalSeconds: global ? 3600 : 1800,
      articleFetchMode: 'HTTP',
      robotsPolicy: 'FOLLOW',
      geographicScope: global ? 'GLOBAL' : 'NATIONAL',
      sourceCategory: 'TOURISM',
      qualityTier: 'UNTESTED',
      freshnessHours: s.freshnessHours ?? 48,
      registryKey: `${TOURISM_REGISTRY_PREFIX}${s.key}`,
      lastPauseReason: status === 'PAUSED' ? 'tourism_seed_paused' : null,
    }
  })
}
