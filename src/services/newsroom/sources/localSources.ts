/**
 * Per-province and regional portal RSS sources for the local news worker.
 * Primary coverage: Google News city queries for all 81 provinces + curated local portals.
 */
import {
  DISTRICT_TO_PROVINCE_SLUG,
  TURKISH_PROVINCES,
  getCityCategoryName,
  isTurkishProvinceSlug,
  type TurkishProvince,
} from '@/constants/cities'
import type { RssSourceDefinition } from '@/services/rss/sources'

export interface LocalFeedMeta {
  citySlug: string
  cityName: string
  district?: string
}

export type LocalFeedSource = RssSourceDefinition & { localMeta: LocalFeedMeta }

export function buildGoogleNewsFeedUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=tr&gl=TR&ceid=TR:tr`
}

function buildGoogleNewsSource(
  province: TurkishProvince,
  maxItemsPerRun: number
): LocalFeedSource {
  return {
    id: `google-news-${province.slug}`,
    label: `Google News — ${province.name}`,
    feedUrl: buildGoogleNewsFeedUrl(`${province.name} haber`),
    maxItemsPerRun,
    enabled: true,
    localMeta: {
      citySlug: province.slug,
      cityName: province.name,
    },
  }
}

function buildGoogleNewsDistrictSource(
  districtSlug: string,
  maxItemsPerRun: number
): LocalFeedSource | null {
  const provinceSlug = DISTRICT_TO_PROVINCE_SLUG[districtSlug]
  if (!provinceSlug) return null

  const districtName = getCityCategoryName(districtSlug)
  return {
    id: `google-news-district-${districtSlug}`,
    label: `Google News — ${districtName}`,
    feedUrl: buildGoogleNewsFeedUrl(`${districtName} haber`),
    maxItemsPerRun,
    enabled: true,
    localMeta: {
      citySlug: provinceSlug,
      cityName: getCityCategoryName(provinceSlug),
      district: districtName,
    },
  }
}

/** Curated city/regional portals with working public RSS (verified periodically). */
export const LOCAL_PORTAL_FEEDS: LocalFeedSource[] = [
  {
    id: 'portal-antalya-ekspres',
    label: 'Antalya Ekspres',
    feedUrl: 'https://www.antalyaekspres.com.tr/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'antalya', cityName: 'Antalya' },
  },
  // ── Çanakkale merkez ──────────────────────────────────────────────────────
  {
    id: 'portal-canakkale-haber',
    label: 'Çanakkale Haber',
    feedUrl: 'https://www.canakkalehaber.com/rss',
    maxItemsPerRun: 5,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale' },
  },
  {
    id: 'portal-canakkale-ninsesi',
    label: "Çanakkale'nin Sesi",
    feedUrl: 'https://www.canakkaleninsesi.com/rss.xml',
    maxItemsPerRun: 5,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale' },
  },
  {
    id: 'portal-canakkale-kaleninsesi',
    label: 'Kalenin Sesi',
    feedUrl: 'https://www.kaleninsesi.com/rss',
    maxItemsPerRun: 5,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale' },
  },
  {
    id: 'portal-canakkale-olay',
    label: 'Çanakkale Olay',
    feedUrl: 'https://www.canakkaleolay.com/rss',
    maxItemsPerRun: 5,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale' },
  },
  // ── Çanakkale ilçeleri ────────────────────────────────────────────────────
  {
    id: 'portal-biga-insesi',
    label: "Biga'nın Sesi",
    feedUrl: 'https://www.biganinsesi.com/rss',
    maxItemsPerRun: 5,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Biga' },
  },
  {
    id: 'portal-can-insesi',
    label: "Çan'ın Sesi",
    feedUrl: 'https://www.caninsesi.com.tr/rss',
    maxItemsPerRun: 5,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Çan' },
  },
  {
    id: 'portal-gelibolu-gaste',
    label: 'Gelibolu Gaşte',
    feedUrl: 'https://www.gelibolugaste.com/feed',
    maxItemsPerRun: 5,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Gelibolu' },
  },
  {
    id: 'portal-bozcaada-haber',
    label: 'Bozcaada Haber',
    feedUrl: 'https://www.bozcaadahaber.net/feed',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Bozcaada' },
  },
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'portal-eskisehir-net',
    label: 'Eskişehir.net',
    feedUrl: 'https://www.eskisehir.net/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'eskisehir', cityName: 'Eskişehir' },
  },
  {
    id: 'portal-haberler-istanbul',
    label: 'Haberler.com — İstanbul',
    feedUrl: 'https://www.haberler.com/rss/istanbul.xml',
    alternateFeedUrls: ['https://www.haberler.com/rss/istanbul-haberleri.xml'],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'istanbul', cityName: 'İstanbul' },
  },
  {
    id: 'portal-haberler-ankara',
    label: 'Haberler.com — Ankara',
    feedUrl: 'https://www.haberler.com/rss/ankara.xml',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'ankara', cityName: 'Ankara' },
  },
  {
    id: 'portal-haberler-izmir',
    label: 'Haberler.com — İzmir',
    feedUrl: 'https://www.haberler.com/rss/izmir.xml',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'izmir', cityName: 'İzmir' },
  },
  {
    id: 'portal-haberler-antalya',
    label: 'Haberler.com — Antalya',
    feedUrl: 'https://www.haberler.com/rss/antalya.xml',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'antalya', cityName: 'Antalya' },
  },
  {
    id: 'portal-haberler-bursa',
    label: 'Haberler.com — Bursa',
    feedUrl: 'https://www.haberler.com/rss/bursa.xml',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'bursa', cityName: 'Bursa' },
  },
  {
    id: 'portal-haberler-adana',
    label: 'Haberler.com — Adana',
    feedUrl: 'https://www.haberler.com/rss/adana.xml',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'adana', cityName: 'Adana' },
  },
  {
    id: 'portal-haberler-gaziantep',
    label: 'Haberler.com — Gaziantep',
    feedUrl: 'https://www.haberler.com/rss/gaziantep.xml',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'gaziantep', cityName: 'Gaziantep' },
  },
]

/** AA regional-style queries via Google News (AA has no public per-il RSS). */
export function buildAaRegionalGoogleSources(maxItemsPerRun: number): LocalFeedSource[] {
  return TURKISH_PROVINCES.map((province) => ({
    id: `aa-google-${province.slug}`,
    label: `AA/Google — ${province.name}`,
    feedUrl: buildGoogleNewsFeedUrl(`"${province.name}" site:aa.com.tr`),
    maxItemsPerRun: Math.min(maxItemsPerRun, 2),
    enabled: true,
    localMeta: {
      citySlug: province.slug,
      cityName: province.name,
    },
  }))
}

function parsePrioritySlugs(): string[] {
  const raw =
    process.env.LOCAL_NEWS_PRIORITY_CITIES?.trim() ||
    'istanbul,ankara,izmir,canakkale,antalya,manavgat'
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export interface LocalNewsSourceRunOptions {
  maxProvinces?: number
  itemsPerSource?: number
  prioritySlugs?: string[]
  includePortals?: boolean
  includeAaRegional?: boolean
}

/** Sources to fetch in one local worker run (env-tunable for cron vs backfill). */
export function getLocalNewsSourcesForRun(
  options: LocalNewsSourceRunOptions = {}
): LocalFeedSource[] {
  const maxProvinces = options.maxProvinces ?? Number(process.env.LOCAL_NEWS_MAX_PROVINCES ?? 81)
  const itemsPerSource =
    options.itemsPerSource ?? Number(process.env.LOCAL_NEWS_ITEMS_PER_SOURCE ?? 3)
  const priority = options.prioritySlugs ?? parsePrioritySlugs()
  const includePortals = options.includePortals !== false
  const includeAaRegional = options.includeAaRegional ?? false

  let provinces = [...TURKISH_PROVINCES]
  provinces.sort((a, b) => {
    const ai = priority.indexOf(a.slug)
    const bi = priority.indexOf(b.slug)
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return a.name.localeCompare(b.name, 'tr')
  })

  const offset = Number(process.env.LOCAL_NEWS_PROVINCE_OFFSET ?? 0)
  if (offset > 0 && maxProvinces < 81) {
    const start = offset % provinces.length
    provinces = [...provinces.slice(start), ...provinces.slice(0, start)]
  }

  provinces = provinces.slice(0, Math.min(maxProvinces, provinces.length))

  const sources: LocalFeedSource[] = provinces.map((p) =>
    buildGoogleNewsSource(p, itemsPerSource)
  )

  for (const slug of priority) {
    if (isTurkishProvinceSlug(slug)) continue
    const districtSource = buildGoogleNewsDistrictSource(slug, itemsPerSource)
    if (districtSource) sources.push(districtSource)
  }

  if (includePortals) {
    const portalSlugs = new Set(provinces.map((p) => p.slug))
    for (const slug of priority) {
      if (isTurkishProvinceSlug(slug)) portalSlugs.add(slug)
      else if (DISTRICT_TO_PROVINCE_SLUG[slug]) portalSlugs.add(DISTRICT_TO_PROVINCE_SLUG[slug]!)
    }
    for (const portal of LOCAL_PORTAL_FEEDS) {
      if (portalSlugs.has(portal.localMeta.citySlug)) {
        sources.push({ ...portal, maxItemsPerRun: itemsPerSource })
      }
    }
  }

  if (includeAaRegional) {
    const aaSources = buildAaRegionalGoogleSources(itemsPerSource).filter((s) =>
      provinces.some((p) => p.slug === s.localMeta.citySlug)
    )
    sources.push(...aaSources)
  }

  return sources
}

export function countLocalNewsSourceCatalog(): {
  googleNewsProvinces: number
  localPortals: number
  totalCatalog: number
} {
  const googleNewsProvinces = TURKISH_PROVINCES.length
  const localPortals = LOCAL_PORTAL_FEEDS.length
  return {
    googleNewsProvinces,
    localPortals,
    totalCatalog: googleNewsProvinces + localPortals + 1,
  }
}
