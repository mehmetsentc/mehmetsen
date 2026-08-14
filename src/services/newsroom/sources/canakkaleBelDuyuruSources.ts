/**
 * Çanakkale ili + ilçe / belde belediye duyuru & haber listeleri.
 * Cron: 2×/gün → yerel-duyuru (city chip: Duyuru).
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
    linkPattern: '/(duyuru|haber|sayfa|icerik|detay)|/\\d{3,}',
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
    linkPattern: '/(duyuru|anons|guncel|haber|icerik)|/\\d{3,}',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Kepez' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-ayvacik-duyuru',
    label: 'Ayvacık Belediyesi Duyurular',
    listUrls: ['https://www.canakkaleayvacik.bel.tr/Gundem/Duyurular'],
    linkPattern: '/(Duyuru|duyuru|Gundem|haber|Detay|detay)|/\\d{3,}',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Ayvacık' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-ezine-duyuru',
    label: 'Ezine Belediyesi Duyurular',
    listUrls: ['https://www.ezine.bel.tr/duyurular', 'https://www.ezine.bel.tr/haberler'],
    linkPattern: '/(duyuru|haber|icerik|detay)|/\\d{3,}',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Ezine' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-geyikli-duyuru',
    label: 'Geyikli Belediyesi Duyurular',
    listUrls: ['https://www.canakkalegeyikli.bel.tr/duyurular/arsiv/1/duyuru-arsivi'],
    linkPattern: '/(duyuru|haber|arsiv|icerik|detay)|/\\d{3,}',
    // Belde under Ezine
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
    linkPattern: '/(duyuru|haber|kategori|icerik|detay)|/\\d{3,}',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Eceabat' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-can-duyuru',
    label: 'Çan Belediyesi Duyurular',
    listUrls: ['https://www.can.bel.tr/'],
    linkPattern: '/(duyuru|haber|icerik|detay|guncel)|/\\d{3,}',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Çan' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-biga-duyuru',
    label: 'Biga Belediyesi Duyurular',
    listUrls: ['https://www.biga.bel.tr/duyurular'],
    linkPattern: '/(duyuru|haber|icerik|detay)|/\\d{3,}',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Biga' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-lapseki-duyuru',
    label: 'Lapseki Belediyesi Duyurular',
    listUrls: ['https://www.lapseki.bel.tr/duyurular'],
    linkPattern: '/(duyuru|haber|icerik|detay)|/\\d{3,}',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Lapseki' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-bozcaada-duyuru',
    label: 'Bozcaada Belediyesi Duyurular',
    listUrls: ['https://www.bozcaada.bel.tr/yazilar/duyurular/'],
    linkPattern: '/(duyuru|yazi|haber|icerik)|/\\d{3,}',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Bozcaada' },
  },
  {
    ...BASE,
    id: 'bel-canakkale-gokceada-duyuru',
    label: 'Gökçeada Belediyesi Duyuru ve Haberler',
    listUrls: ['https://www.gokceada.bel.tr/duyuru-ve-haberler/'],
    linkPattern: '/(duyuru|haber|icerik|detay)|/\\d{3,}',
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Gökçeada' },
  },
]

export function getEnabledCanakkaleBelDuyuruSources(): ScraperSource[] {
  return CANAKKALE_BEL_DUYURU_SOURCES.filter((s) => s.enabled)
}
