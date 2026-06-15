/**
 * Scraper Source Definitions — RSS'i olmayan veya 403 veren yerel haber siteleri.
 *
 * Her kaynak için:
 *   listUrls    — Haberlerin listelendiği sayfalar (anasayfa veya kategori sayfası)
 *   linkSelector — Haber linklerini seçen CSS selector (opsiyonel, generic fallback var)
 *   linkPattern  — URL'de bulunması gereken desen (regex string)
 *   maxItems     — Her run'da işlenecek max haber sayısı
 *   localMeta    — Şehir/ilçe bilgisi
 */

export interface ScraperSource {
  id: string
  label: string
  enabled: boolean
  listUrls: string[]
  /** CSS selector for <a> tags on the list page. Defaults to generic article link detection. */
  linkSelector?: string
  /** Regex pattern — URL must match to be included. */
  linkPattern?: string
  /** Regex pattern — URL must NOT match to be excluded. */
  linkExcludePattern?: string
  maxItems: number
  localMeta: {
    citySlug: string
    cityName: string
    district?: string
  }
}

/**
 * Scraper sources — sorted by city slug alphabetically.
 * Add new portals here when RSS is blocked or unavailable.
 */
export const SCRAPER_PORTAL_FEEDS: ScraperSource[] = [
  // ── Çanakkale ────────────────────────────────────────────────────────────
  {
    id: 'scraper-canakkale-kaleninsesi',
    label: 'Kalenin Sesi (scraper)',
    enabled: true,
    listUrls: ['https://www.kaleninsesi.com/', 'https://www.kaleninsesi.com/son-dakika'],
    linkPattern: '/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale' },
  },
  {
    id: 'scraper-canakkale-gundem',
    label: 'Çanakkale Gündem (scraper)',
    enabled: true,
    listUrls: ['https://canakkalegundem.net/', 'https://canakkalegundem.net/son-dakika'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale' },
  },
  {
    id: 'scraper-canakkale-can-insesi',
    label: 'Çan İnsesi (scraper)',
    enabled: true,
    listUrls: ['https://www.caninsesi.com.tr/'],
    linkPattern: '/haber/|/detay/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Çan' },
  },

  // ── Bursa ─────────────────────────────────────────────────────────────────
  {
    id: 'scraper-bursa-olay',
    label: 'Bursa Olay (scraper)',
    enabled: true,
    listUrls: ['https://www.bursaolay.com/', 'https://www.bursaolay.com/son-dakika'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'bursa', cityName: 'Bursa' },
  },

  // ── İzmir ─────────────────────────────────────────────────────────────────
  {
    id: 'scraper-izmir-yasamgazetesi',
    label: 'İzmir Yaşam Gazetesi (scraper)',
    enabled: true,
    listUrls: ['https://www.izmirgazetesi.com.tr/'],
    linkPattern: '/haber/|/detay/|/\\d{4,}',
    maxItems: 5,
    localMeta: { citySlug: 'izmir', cityName: 'İzmir' },
  },

  // ── Ankara ────────────────────────────────────────────────────────────────
  {
    id: 'scraper-ankara-yerel',
    label: 'Ankara Yerel Haber (scraper)',
    enabled: true,
    listUrls: ['https://www.ankarayerelhaber.com/'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'ankara', cityName: 'Ankara' },
  },

  // ── İstanbul ─────────────────────────────────────────────────────────────
  {
    id: 'scraper-istanbul-gazete',
    label: 'İstanbul Gazete (scraper)',
    enabled: true,
    listUrls: ['https://www.istanbulgazetesi.com.tr/'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'istanbul', cityName: 'İstanbul' },
  },

  // ── Antalya ───────────────────────────────────────────────────────────────
  {
    id: 'scraper-antalya-olay',
    label: 'Antalya Olay (scraper)',
    enabled: true,
    listUrls: ['https://www.antalyaolay.com/'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'antalya', cityName: 'Antalya' },
  },

  // ── Konya ─────────────────────────────────────────────────────────────────
  {
    id: 'scraper-konya-ovahaber',
    label: 'Konya Ova Haber (scraper)',
    enabled: true,
    listUrls: ['https://www.konyaovahaber.com/'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'konya', cityName: 'Konya' },
  },

  // ── Kayseri ───────────────────────────────────────────────────────────────
  {
    id: 'scraper-kayseri-ses',
    label: 'Kayseri Ses (scraper)',
    enabled: true,
    listUrls: ['https://www.kayseri.com.tr/'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'kayseri', cityName: 'Kayseri' },
  },

  // ── Trabzon ───────────────────────────────────────────────────────────────
  {
    id: 'scraper-trabzon-haber',
    label: 'Trabzon Haber (scraper)',
    enabled: true,
    listUrls: ['https://www.trabzonhaber.com/'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'trabzon', cityName: 'Trabzon' },
  },

  // ── Samsun ────────────────────────────────────────────────────────────────
  {
    id: 'scraper-samsun-yerel',
    label: 'Samsun Yerel Haber (scraper)',
    enabled: true,
    listUrls: ['https://www.samsunhaber.com/'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'samsun', cityName: 'Samsun' },
  },

  // ── Gaziantep ─────────────────────────────────────────────────────────────
  {
    id: 'scraper-gaziantep-olay',
    label: 'Gaziantep Olay (scraper)',
    enabled: true,
    listUrls: ['https://www.gaziantepolay.com/'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'gaziantep', cityName: 'Gaziantep' },
  },

  // ── Diyarbakır ────────────────────────────────────────────────────────────
  {
    id: 'scraper-diyarbakir-haber',
    label: 'Diyarbakır Haber (scraper)',
    enabled: true,
    listUrls: ['https://www.diyarbakirhaber.com.tr/'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'diyarbakir', cityName: 'Diyarbakır' },
  },

  // ── Erzurum ───────────────────────────────────────────────────────────────
  {
    id: 'scraper-erzurum-haber',
    label: 'Erzurum Haber (scraper)',
    enabled: true,
    listUrls: ['https://www.erzurumhaber.com.tr/'],
    linkPattern: '/haber/|/\\d{5,}',
    maxItems: 5,
    localMeta: { citySlug: 'erzurum', cityName: 'Erzurum' },
  },
]

/** Enabled scraper sources only */
export function getEnabledScraperSources(): ScraperSource[] {
  return SCRAPER_PORTAL_FEEDS.filter(s => s.enabled)
}

/** Scraper sources for a specific city */
export function getScraperSourcesForCity(citySlug: string): ScraperSource[] {
  return SCRAPER_PORTAL_FEEDS.filter(
    s => s.enabled && s.localMeta.citySlug === citySlug
  )
}
