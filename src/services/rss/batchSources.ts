import type { RssSourceDefinition } from '@/services/rss/sources'

/** Target categories for batch news ingestion. */
export const BATCH_TARGET_CATEGORIES = [
  'gundem',
  'spor',
  'teknoloji',
  'kultur',
  'saglik',
  'magazin',
  'dunya',
] as const

export type BatchTargetCategory = (typeof BATCH_TARGET_CATEGORIES)[number]

interface CategoryFeedRef {
  sourceId: string
  label: string
  feedUrl: string
}

/** Category-specific RSS endpoints (AA, BBC TR, CNN TR, NTV, Habertürk, Sözcü, T24, Gazete Duvar). */
const CATEGORY_FEED_URLS: Record<BatchTargetCategory, CategoryFeedRef[]> = {
  gundem: [
    { sourceId: 'aa', label: 'Anadolu Ajansı', feedUrl: 'https://www.aa.com.tr/tr/rss/default?cat=guncel' },
    { sourceId: 'bbc', label: 'BBC Türkçe', feedUrl: 'https://feeds.bbci.co.uk/turkce/rss.xml' },
    { sourceId: 'cnn', label: 'CNN Türk', feedUrl: 'https://www.cnnturk.com/feed/rss/all/news' },
    { sourceId: 'ntv', label: 'NTV', feedUrl: 'https://www.ntv.com.tr/gundem.rss' },
    { sourceId: 'haberturk', label: 'Habertürk', feedUrl: 'https://www.haberturk.com/rss/kategori/gundem.xml' },
    { sourceId: 'sozcu', label: 'Sözcü', feedUrl: 'https://www.sozcu.com.tr/rss/gundem' },
    { sourceId: 't24', label: 'T24', feedUrl: 'https://t24.com.tr/rss/haber/gundem' },
    { sourceId: 'hurriyet', label: 'Hürriyet', feedUrl: 'https://www.hurriyet.com.tr/rss/gundem' },
    { sourceId: 'gazeteduvar', label: 'Gazete Duvar', feedUrl: 'https://www.gazeteduvar.com.tr/gundem/rss' },
  ],
  spor: [
    { sourceId: 'ntv', label: 'NTV', feedUrl: 'https://www.ntv.com.tr/spor.rss' },
    { sourceId: 'haberturk', label: 'Habertürk', feedUrl: 'https://www.haberturk.com/rss/kategori/spor.xml' },
    { sourceId: 'cnn', label: 'CNN Türk', feedUrl: 'https://www.cnnturk.com/feed/rss/spor/news' },
    { sourceId: 'aa', label: 'Anadolu Ajansı', feedUrl: 'https://www.aa.com.tr/tr/rss/default?cat=spor' },
    { sourceId: 'bbc', label: 'BBC Türkçe', feedUrl: 'https://feeds.bbci.co.uk/turkce/rss.xml' },
  ],
  teknoloji: [
    { sourceId: 'ntv', label: 'NTV', feedUrl: 'https://www.ntv.com.tr/teknoloji.rss' },
    { sourceId: 'haberturk', label: 'Habertürk', feedUrl: 'https://www.haberturk.com/rss/kategori/teknoloji.xml' },
    { sourceId: 'cnn', label: 'CNN Türk', feedUrl: 'https://www.cnnturk.com/feed/rss/bilim-teknoloji/news' },
    { sourceId: 't24', label: 'T24', feedUrl: 'https://t24.com.tr/rss/haber/teknoloji' },
  ],
  kultur: [
    { sourceId: 'ntv', label: 'NTV', feedUrl: 'https://www.ntv.com.tr/sanat.rss' },
    { sourceId: 'haberturk', label: 'Habertürk', feedUrl: 'https://www.haberturk.com/rss/kategori/kultur-sanat.xml' },
    { sourceId: 't24', label: 'T24', feedUrl: 'https://t24.com.tr/rss/haber/kultur' },
    { sourceId: 'bbc', label: 'BBC Türkçe', feedUrl: 'https://feeds.bbci.co.uk/turkce/rss.xml' },
  ],
  saglik: [
    { sourceId: 'ntv', label: 'NTV', feedUrl: 'https://www.ntv.com.tr/saglik.rss' },
    { sourceId: 'haberturk', label: 'Habertürk', feedUrl: 'https://www.haberturk.com/rss/kategori/saglik.xml' },
    { sourceId: 'aa', label: 'Anadolu Ajansı', feedUrl: 'https://www.aa.com.tr/tr/rss/default?cat=saglik' },
  ],
  magazin: [
    { sourceId: 'ntv', label: 'NTV', feedUrl: 'https://www.ntv.com.tr/magazin.rss' },
    { sourceId: 'haberturk', label: 'Habertürk', feedUrl: 'https://www.haberturk.com/rss/kategori/magazin.xml' },
    { sourceId: 'cnn', label: 'CNN Türk', feedUrl: 'https://www.cnnturk.com/feed/rss/magazin/news' },
    { sourceId: 'sozcu', label: 'Sözcü', feedUrl: 'https://www.sozcu.com.tr/rss/magazin' },
  ],
  dunya: [
    { sourceId: 'ntv', label: 'NTV', feedUrl: 'https://www.ntv.com.tr/dunya.rss' },
    { sourceId: 'haberturk', label: 'Habertürk', feedUrl: 'https://www.haberturk.com/rss/kategori/dunya.xml' },
    { sourceId: 'bbc', label: 'BBC Türkçe', feedUrl: 'https://feeds.bbci.co.uk/turkce/rss.xml' },
    { sourceId: 'cnn', label: 'CNN Türk', feedUrl: 'https://www.cnnturk.com/feed/rss/dunya/news' },
    { sourceId: 't24', label: 'T24', feedUrl: 'https://t24.com.tr/rss/haber/dunya' },
    { sourceId: 'aa', label: 'Anadolu Ajansı', feedUrl: 'https://www.aa.com.tr/tr/rss/default?cat=dunya' },
  ],
}

const WORLD_CUP_KEYWORDS = [
  'dünya kupası',
  'dunya kupasi',
  'world cup',
  'fifa',
  '2026',
  'mundial',
  'katar',
]

export function isWorldCupRelated(text: string): boolean {
  const lower = text.toLowerCase()
  return WORLD_CUP_KEYWORDS.some((kw) => lower.includes(kw))
}

export function parseBatchCategories(raw?: string | null): BatchTargetCategory[] {
  if (!raw?.trim()) return [...BATCH_TARGET_CATEGORIES]
  const allowed = new Set<string>(BATCH_TARGET_CATEGORIES)
  const aliases: Record<string, BatchTargetCategory> = {
    'kultur-sanat': 'kultur',
    dedikodu: 'magazin',
    entertainment: 'magazin',
    'world-cup': 'spor',
    'dunya-kupasi': 'spor',
  }
  const parsed: BatchTargetCategory[] = []
  for (const part of raw.split(',')) {
    const slug = part.trim().toLowerCase()
    const mapped = (aliases[slug] ?? slug) as BatchTargetCategory
    if (allowed.has(mapped) && !parsed.includes(mapped)) {
      parsed.push(mapped)
    }
  }
  return parsed.length > 0 ? parsed : [...BATCH_TARGET_CATEGORIES]
}

/** Build RSS source definitions for a single target category bucket. */
export function getBatchRssSourcesForCategory(categoryId: BatchTargetCategory): RssSourceDefinition[] {
  const feeds = CATEGORY_FEED_URLS[categoryId] ?? []
  return feeds.map((f) => ({
    id: `${f.sourceId}-${categoryId}`,
    label: f.label,
    feedUrl: f.feedUrl,
    maxItemsPerRun: 8,
    enabled: true,
  }))
}
