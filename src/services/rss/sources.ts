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
