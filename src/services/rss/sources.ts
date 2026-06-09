/**
 * RSS feed sources for the AI news ingestion pipeline.
 * Override any feed URL via env: RSS_FEED_{SOURCE_ID}=https://…
 * Disable sources via env: RSS_DISABLED_SOURCES=iha,dha,t24,gazeteduvar
 */

export type RssFeedFormat = 'rss' | 'trt-xml'

export interface RssSourceDefinition {
  id: string
  label: string
  /** Default RSS/Atom feed URL */
  feedUrl: string
  /** Alternate URLs tried when primary fetch/parse fails */
  alternateFeedUrls?: string[]
  /** Non-standard feed shape (e.g. TRT xml_mobile.php) */
  feedFormat?: RssFeedFormat
  /** Max new items to process per cron run (rate-limit guard) */
  maxItemsPerRun: number
  enabled: boolean
  /** Optional local-news metadata (province slug/name from worker). */
  localMeta?: {
    citySlug: string
    cityName: string
    district?: string
  }
}

const DEFAULT_SOURCES: RssSourceDefinition[] = [
  {
    id: 'aa',
    label: 'Anadolu Ajansı',
    feedUrl: 'https://www.aa.com.tr/tr/rss/default?cat=guncel',
    alternateFeedUrls: [
      'https://www.aa.com.tr/rss/ajansguncel.xml',
      'https://www.aa.com.tr/tr/rss/default?cat=yerel',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },
  {
    id: 'iha',
    label: 'İHA',
    feedUrl: 'https://news.google.com/rss/search?q=site:iha.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    alternateFeedUrls: ['https://www.iha.com.tr/rss/guncel', 'https://www.iha.com.tr/rss.aspx'],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'dha',
    label: 'DHA',
    feedUrl: 'https://news.google.com/rss/search?q=site:dha.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    alternateFeedUrls: ['https://news.google.com/rss/search?q=DHA+Demir%C3%B6ren+haber&hl=tr&gl=TR&ceid=TR:tr'],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'reuters',
    label: 'Reuters',
    feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    maxItemsPerRun: 10,
    enabled: true,
  },
  {
    id: 'bbc',
    label: 'BBC Türkçe',
    feedUrl: 'https://feeds.bbci.co.uk/turkce/rss.xml',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'cnn',
    label: 'CNN Türk',
    feedUrl: 'https://www.cnnturk.com/feed/rss/all/news',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'trt',
    label: 'TRT Haber',
    feedUrl:
      'https://www.trthaber.com/xml_mobile.php?tur=xml_genel&kategori=gundem&adet=20',
    feedFormat: 'trt-xml',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'ntv',
    label: 'NTV',
    feedUrl: 'https://www.ntv.com.tr/gundem.rss',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'haberturk',
    label: 'Habertürk',
    feedUrl: 'https://www.haberturk.com/rss/kategori/gundem.xml',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'hurriyet',
    label: 'Hürriyet',
    feedUrl: 'https://www.hurriyet.com.tr/rss/gundem',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'sozcu',
    label: 'Sözcü',
    feedUrl: 'https://www.sozcu.com.tr/feeds-haberler',
    alternateFeedUrls: ['https://www.sozcu.com.tr/rss/gundem', 'https://www.sozcu.com.tr/rss/guncel'],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 't24',
    label: 'T24',
    feedUrl: 'https://t24.com.tr/rss/haber/gundem',
    alternateFeedUrls: [
      'https://t24.com.tr/rss/haber/gundem/feed',
      'https://t24.com.tr/rss',
      'https://news.google.com/rss/search?q=site:t24.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'gazeteduvar',
    label: 'Gazete Duvar',
    feedUrl: 'https://www.gazeteduvar.com.tr/gundem/rss',
    alternateFeedUrls: [
      'https://www.gazeteduvar.com.tr/rss',
      'https://news.google.com/rss/search?q=site:gazeteduvar.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── Finans ───────────────────────────────────────────────────────────────
  {
    id: 'bloomberght',
    label: 'Bloomberg HT',
    feedUrl: 'https://www.bloomberght.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:bloomberght.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },
  {
    id: 'dunya-ekonomi',
    label: 'Dünya Gazetesi',
    feedUrl: 'https://www.dunya.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:dunya.com+ekonomi&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'ekonomim',
    label: 'Ekonomim',
    feedUrl: 'https://www.ekonomim.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:ekonomim.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'ntv-ekonomi',
    label: 'NTV Ekonomi',
    feedUrl: 'https://www.ntv.com.tr/ekonomi.rss',
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'haberturk-ekonomi',
    label: 'Habertürk Ekonomi',
    feedUrl: 'https://www.haberturk.com/rss/kategori/ekonomi.xml',
    maxItemsPerRun: 4,
    enabled: true,
  },

  // ── Eğlence / Magazin / Kültür / Spor ───────────────────────────────────
  {
    id: 'milliyet-magazin',
    label: 'Milliyet Magazin',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssNew/magazinRss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:milliyet.com.tr+magazin&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'sabah-magazin',
    label: 'Sabah Magazin',
    feedUrl: 'https://www.sabah.com.tr/rss/magazin.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:sabah.com.tr+magazin&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'posta-magazin',
    label: 'Posta Magazin',
    feedUrl: 'https://www.posta.com.tr/rss/magazin',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:posta.com.tr+magazin&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'ntv-spor',
    label: 'NTV Spor',
    feedUrl: 'https://www.ntvspor.net/rss/tum-haberler',
    alternateFeedUrls: [
      'https://www.ntvspor.net/rss',
      'https://news.google.com/rss/search?q=site:ntvspor.net&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },
  {
    id: 'hurriyet-spor',
    label: 'Hürriyet Spor',
    feedUrl: 'https://www.hurriyet.com.tr/rss/spor',
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'ntv-kultur',
    label: 'NTV Kültür Sanat',
    feedUrl: 'https://www.ntv.com.tr/kultur-sanat.rss',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'haberturk-spor',
    label: 'Habertürk Spor',
    feedUrl: 'https://www.haberturk.com/rss/kategori/spor.xml',
    maxItemsPerRun: 4,
    enabled: true,
  },

  // ── Kripto ───────────────────────────────────────────────────────────────
  {
    id: 'coindesk',
    label: 'CoinDesk',
    feedUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:coindesk.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'cointelegraph',
    label: 'CoinTelegraph',
    feedUrl: 'https://cointelegraph.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:cointelegraph.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'kriptokoin',
    label: 'Kriptokoin.com',
    feedUrl: 'https://kriptokoin.com/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:kriptokoin.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'btchaber',
    label: 'BtcHaber',
    feedUrl: 'https://btchaber.com/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:btchaber.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
]

function envFeedOverride(sourceId: string): string | undefined {
  const key = `RSS_FEED_${sourceId.toUpperCase().replace(/-/g, '_')}`
  return process.env[key]?.trim() || undefined
}

function isSourceEnabled(sourceId: string): boolean {
  const disabled = process.env.RSS_DISABLED_SOURCES?.trim()
  if (!disabled) return true
  const set = new Set(disabled.split(',').map((s) => s.trim().toLowerCase()))
  return !set.has(sourceId.toLowerCase())
}

/** Returns enabled RSS sources with env overrides applied. */
export function getRssSources(): RssSourceDefinition[] {
  return DEFAULT_SOURCES.map((src) => ({
    ...src,
    feedUrl: envFeedOverride(src.id) ?? src.feedUrl,
    enabled: src.enabled && isSourceEnabled(src.id),
  })).filter((s) => s.enabled)
}

export function getRssSourceById(id: string): RssSourceDefinition | undefined {
  return getRssSources().find((s) => s.id === id)
}
