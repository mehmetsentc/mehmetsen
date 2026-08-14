/**
 * Çanakkale ili + ilçe / belde belediye duyuru & haber listeleri.
 * Cron: 2×/gün (06:00 & 18:00 TR) → yerel-duyuru; sosyal cron paylaşır.
 */
import type { ScraperSource } from '@/services/newsroom/sources/scraperSources'

/** Son 12 saat — günde 2 koşuda taze duyurular. */
export const CANAKKALE_BEL_DUYURU_MAX_AGE_MS = 12 * 60 * 60 * 1000

const BASE = {
  enabled: true as const,
  maxItems: 4,
  forcedCategoryId: 'yerel-duyuru' as const,
  lockForcedCategory: true as const,
  maxAgeMs: CANAKKALE_BEL_DUYURU_MAX_AGE_MS,
  linkExcludePattern:
    '/(login|giris|uye|arama|search|rss|sitemap|iletisim|contact|kvkk|cerez|cookie|gizlilik)/',
}

export const CANAKKALE_BEL_DUYURU_SOURCES: ScraperSource[] = [
  {
    ...BASE,
    id: 'bel-canakkale-merkez-duyuru',
    label: 'Çanakkale Belediyesi Duyurular',
    listUrls: ['https://www.canakkale.bel.tr/tr/sayfa/1213-genel-duyurular'],
    // Detail: /tr/sayfa/1213-genel-duyurular/11387-slug
    linkPattern: '/tr/sayfa/1213-genel-duyurular/\\d+-',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Merkez' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-kepez-duyuru',
    label: 'Kepez Belediyesi Duyurular',
    listUrls: [
      'https://www.kepez.bel.tr/guncel/duyurular/',
      'https://www.kepez.bel.tr/guncel/anonslar/',
    ],
    // WP posts: /13-08-2026-tarihli-... or /anons-tarihi-13-08-2026-...
    linkPattern: '/(?:\\d{1,2}-\\d{1,2}-20\\d{2}-|anons-tarihi-)[a-z0-9-]+/?$',
    linkExcludePattern: BASE.linkExcludePattern + '|/(guncel|kurumsal|hizmetler|mudurluk)/',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Kepez' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-ayvacik-duyuru',
    label: 'Ayvacık Belediyesi Duyurular',
    listUrls: ['https://www.canakkaleayvacik.bel.tr/Gundem/Duyurular'],
    linkPattern: '/Gundem/(Duyuru|Haber|duyuru|haber)[^/]*/|/Detay/|/\\d{4,}',
    linkExcludePattern: BASE.linkExcludePattern + '|/Gundem/Duyurular/?$|/Gundem/Haberler/\\d*/?$',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Ayvacık' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-ezine-duyuru',
    label: 'Ezine Belediyesi Duyurular',
    listUrls: ['https://www.ezine.bel.tr/duyurular', 'https://www.ezine.bel.tr/haberler'],
    linkPattern: '/(?:duyurular|haberler)/[a-z0-9-]{8,}/?$',
    linkExcludePattern: BASE.linkExcludePattern + '|/(?:duyurular|haberler)/?$',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Ezine' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-geyikli-duyuru',
    label: 'Geyikli Belediyesi Duyurular',
    listUrls: ['https://www.canakkalegeyikli.bel.tr/duyurular/arsiv/1/duyuru-arsivi'],
    linkPattern: '/duyurular?/[^/]+|/haber[^/]*/|/icerik/|/\\d{4,}',
    linkExcludePattern: BASE.linkExcludePattern + '|/arsiv/',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Ezine' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-eceabat-duyuru',
    label: 'Eceabat Belediyesi Duyurular',
    listUrls: [
      'https://www.eceabat.bel.tr/kategori/duyurular',
      'https://www.eceabat.bel.tr/kategori/haberler',
    ],
    linkPattern: '/(?:haber|duyuru)/[a-z0-9-]{5,}/?$',
    linkExcludePattern: BASE.linkExcludePattern + '|/kategori/',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Eceabat' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-can-duyuru',
    label: 'Çan Belediyesi Duyurular',
    listUrls: ['https://www.can.bel.tr/duyurular', 'https://www.can.bel.tr/'],
    linkPattern: '/(?:duyuru|haber|ilan)[a-z0-9/-]*[a-z0-9-]{6,}',
    linkExcludePattern: BASE.linkExcludePattern + '|/duyurular/?$',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Çan' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-biga-duyuru',
    label: 'Biga Belediyesi Duyurular',
    listUrls: ['https://www.biga.bel.tr/duyurular'],
    linkPattern: '/duyurular/[a-z0-9-]{8,}/?$',
    linkExcludePattern: BASE.linkExcludePattern + '|/duyurular/?$|\\.pdf',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Biga' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-lapseki-duyuru',
    label: 'Lapseki Belediyesi Duyurular',
    listUrls: ['https://www.lapseki.bel.tr/duyurular', 'https://www.lapseki.bel.tr/haberler'],
    linkPattern: '/(?:duyuru|haber|icerik)/[a-z0-9-]{5,}',
    linkExcludePattern: BASE.linkExcludePattern + '|/(?:duyurular|haberler)/?$',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Lapseki' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-bozcaada-duyuru',
    label: 'Bozcaada Belediyesi Duyurular',
    listUrls: [
      'https://www.bozcaada.bel.tr/yazilar/duyurular/',
      'https://www.bozcaada.bel.tr/yazilar/haberler/',
    ],
    linkPattern: '/(?:duyuru|haber)-[a-z0-9-]+/?$',
    linkExcludePattern: BASE.linkExcludePattern + '|/yazilar/',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Bozcaada' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-gokceada-duyuru',
    label: 'Gökçeada Belediyesi Duyuru ve Haberler',
    listUrls: ['https://www.gokceada.bel.tr/duyuru-ve-haberler/'],
    // Many items are direct PDF/PNG uploads under wp-content
    linkPattern: '/wp-content/uploads/20\\d{2}/.+\\.(?:pdf|png|jpe?g)(?:$|\\?)|/(?:duyuru|haber)[a-z0-9-]{6,}/?$',
    linkExcludePattern: BASE.linkExcludePattern + '|/duyuru-ve-haberler/?$',
    maxItems: 3,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Gökçeada' },
  },
]

export function getEnabledCanakkaleBelDuyuruSources(): ScraperSource[] {
  return CANAKKALE_BEL_DUYURU_SOURCES.filter((s) => s.enabled)
}
