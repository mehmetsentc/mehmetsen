/**
 * Per-province and regional portal RSS sources for the local news worker.
 * Primary coverage: Google News city queries for all 81 provinces + curated local portals.
 *
 * Wire agencies (AA, İHA, DHA, ANKA) are defined in rss/sources.ts and run separately
 * via LOCAL_NEWS_SOURCE_IDS in config.ts.
 *
 * Per-province pipeline (each run):
 *   1. Google News — backbone, catches everything, every city
 *   2. haberler.com — city aggregator RSS, higher signal than raw Google News
 *   3. LOCAL_PORTAL_FEEDS — curated local gazeteler / portals per il
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

/**
 * haberler.com slug overrides — where province.slug differs from haberler.com's URL segment.
 * Confirmed pattern: istanbul, ankara, izmir, antalya, bursa, adana, gaziantep all match slug.
 */
const HABERLER_COM_SLUG_OVERRIDES: Record<string, string> = {
  afyonkarahisar: 'afyon',
}

function buildHaberlerComSource(
  province: TurkishProvince,
  maxItemsPerRun: number
): LocalFeedSource {
  const haberlerSlug = HABERLER_COM_SLUG_OVERRIDES[province.slug] ?? province.slug
  return {
    id: `haberler-com-${province.slug}`,
    label: `Haberler.com — ${province.name}`,
    feedUrl: `https://www.haberler.com/rss/${haberlerSlug}.xml`,
    alternateFeedUrls: [buildGoogleNewsFeedUrl(`${province.name} haberleri site:haberler.com`)],
    maxItemsPerRun,
    enabled: true,
    localMeta: {
      citySlug: province.slug,
      cityName: province.name,
    },
  }
}

/**
 * Curated city/regional portals with RSS — verified local gazeteler per il.
 * Google News + haberler.com already cover all 81 iller; these portals add a
 * third local-specific signal for provinces with active online press.
 */
export const LOCAL_PORTAL_FEEDS: LocalFeedSource[] = [
  // ── Adana ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-adana-5ocak',
    label: '5 Ocak Gazetesi',
    feedUrl: 'https://www.5ocakgazetesi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Adana haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'adana', cityName: 'Adana' },
  },
  {
    id: 'portal-adana-haber-merkezi',
    label: 'Adana Haber Merkezi',
    feedUrl: 'https://www.adanahabermerkezi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Adana haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'adana', cityName: 'Adana' },
  },
  // ── Adıyaman ──────────────────────────────────────────────────────────────
  {
    id: 'portal-adiyaman-haber',
    label: 'Adıyaman Haber',
    feedUrl: 'https://www.adiyamanhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Adıyaman haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'adiyaman', cityName: 'Adıyaman' },
  },
  // ── Ağrı ──────────────────────────────────────────────────────────────────
  {
    id: 'portal-agri-04haber',
    label: 'Ağrı 04 Haber',
    feedUrl: 'https://www.agri04haber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Ağrı haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'agri', cityName: 'Ağrı' },
  },
  // ── Afyonkarahisar ────────────────────────────────────────────────────────
  {
    id: 'portal-afyon-gazete',
    label: 'Afyon Gazete',
    feedUrl: 'https://www.afyongazete.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Afyonkarahisar haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'afyonkarahisar', cityName: 'Afyonkarahisar' },
  },
  // ── Amasya ────────────────────────────────────────────────────────────────
  {
    id: 'portal-amasya-objektif',
    label: 'Objektif Amasya',
    feedUrl: 'https://www.objektifamasya.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Amasya haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'amasya', cityName: 'Amasya' },
  },
  // ── Ankara ────────────────────────────────────────────────────────────────
  {
    id: 'portal-haber-ankara',
    label: 'Haber Ankara',
    feedUrl: 'https://www.haberankara.com/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'ankara', cityName: 'Ankara' },
  },
  // ── Antalya ───────────────────────────────────────────────────────────────
  {
    id: 'portal-antalya-ekspres',
    label: 'Antalya Ekspres',
    feedUrl: 'https://www.antalyaekspres.com.tr/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'antalya', cityName: 'Antalya' },
  },
  // ── Artvin ────────────────────────────────────────────────────────────────
  {
    id: 'portal-artvin-haber',
    label: 'Artvin Haber',
    feedUrl: 'https://www.artvinhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Artvin haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'artvin', cityName: 'Artvin' },
  },
  // ── Aydın ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-aydin-haber',
    label: 'Aydın Haber',
    feedUrl: 'https://www.aydinhaber.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Aydın haber site:aydinhaber.com.tr')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'aydin', cityName: 'Aydın' },
  },
  // ── Balıkesir ─────────────────────────────────────────────────────────────
  {
    id: 'portal-balikesirim-net',
    label: 'Balıkesirim.net',
    feedUrl: 'https://www.balikesirim.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Balıkesir haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'balikesir', cityName: 'Balıkesir' },
  },
  {
    id: 'portal-balikesir-ege-gundem',
    label: 'Ege Gündem',
    feedUrl: 'https://www.egegundem.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Balıkesir haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'balikesir', cityName: 'Balıkesir' },
  },
  // ── Bartın ────────────────────────────────────────────────────────────────
  {
    id: 'portal-bartin-pusula',
    label: 'Bartın Pusula Gazetesi',
    feedUrl: 'https://www.pusulagazetesi.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Bartın haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'bartin', cityName: 'Bartın' },
  },
  // ── Batman ────────────────────────────────────────────────────────────────
  {
    id: 'portal-batman-haber',
    label: 'Batman Haber',
    feedUrl: 'https://www.batmanhaber.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Batman haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'batman', cityName: 'Batman' },
  },
  // ── Bayburt ───────────────────────────────────────────────────────────────
  {
    id: 'portal-bayburt-gundem',
    label: 'Bayburt Gündem',
    feedUrl: 'https://www.bayburtgundem.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Bayburt haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'bayburt', cityName: 'Bayburt' },
  },
  {
    id: 'portal-bayburt-postasi',
    label: 'Bayburt Postası',
    feedUrl: 'https://www.bayburtpostasi.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Bayburt haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'bayburt', cityName: 'Bayburt' },
  },
  // ── Bilecik ───────────────────────────────────────────────────────────────
  {
    id: 'portal-bilecik-olay',
    label: 'Bilecik Olay',
    feedUrl: 'https://www.bilecikolay.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Bilecik haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'bilecik', cityName: 'Bilecik' },
  },
  // ── Bingöl ────────────────────────────────────────────────────────────────
  {
    id: 'portal-bingol-kenthaber',
    label: 'Bingöl Kent Haber',
    feedUrl: 'https://www.bingolkenthaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Bingöl haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'bingol', cityName: 'Bingöl' },
  },
  // ── Bitlis ────────────────────────────────────────────────────────────────
  {
    id: 'portal-bitlis-dogruhaber',
    label: 'Bitlis Doğru Haber',
    feedUrl: 'https://www.bitlisdogruhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Bitlis haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'bitlis', cityName: 'Bitlis' },
  },
  {
    id: 'portal-bitlis-haber13',
    label: 'Bitlis Haber 13',
    feedUrl: 'https://www.bitlishaber13.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Bitlis haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'bitlis', cityName: 'Bitlis' },
  },
  // ── Bolu ──────────────────────────────────────────────────────────────────
  {
    id: 'portal-bolu-haber',
    label: 'Bolu Haber',
    feedUrl: 'https://www.boluhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Bolu haber site:boluhaber.com')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'bolu', cityName: 'Bolu' },
  },
  // ── Burdur ────────────────────────────────────────────────────────────────
  {
    id: 'portal-burdur-gazete',
    label: 'Burdur Gazetesi',
    feedUrl: 'https://www.burdurgazetesi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Burdur haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'burdur', cityName: 'Burdur' },
  },
  {
    id: 'portal-burdur-yenigun',
    label: 'Burdur Yenigün',
    feedUrl: 'https://www.burduryenigun.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Burdur haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'burdur', cityName: 'Burdur' },
  },
  // ── Bursa ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-bursa-haber',
    label: 'Bursa Haber',
    feedUrl: 'https://www.bursahaber.com/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'bursa', cityName: 'Bursa' },
  },
  // ── Çanakkale ─────────────────────────────────────────────────────────────
  // Merkez il haberleri — doğrulanmış RSS feed'leri
  {
    id: 'portal-canakkale-haber',
    label: 'Çanakkale Haber',
    feedUrl: 'https://www.canakkalehaber.com/rss',
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
  {
    id: 'portal-canakkale-gundem',
    label: 'Çanakkale Gündem',
    feedUrl: 'https://canakkalegundem.net/rss',
    maxItemsPerRun: 5,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale' },
  },
  {
    id: 'portal-canakkale-aynalipazar',
    label: 'Çanakkale Aynalı Pazar',
    feedUrl: 'https://www.canakkaleaynalipazar.com/rss.xml',
    maxItemsPerRun: 5,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale' },
  },
  // Çanakkale ilçeleri — doğrulanmış RSS feed'leri
  {
    id: 'portal-biga-insesi',
    label: "Biga'nın Sesi",
    feedUrl: 'https://www.biganinsesi.com/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Biga' },
  },
  {
    id: 'portal-bogaz-gazetesi',
    label: 'Boğaz Gazetesi',
    feedUrl: 'https://www.bogazgazetesi.com.tr/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Biga' },
  },
  {
    id: 'portal-medya-lokum',
    label: 'Medya Lokum (Biga)',
    feedUrl: 'https://www.medyalokum.com/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Biga' },
  },
  {
    id: 'portal-can-insesi',
    label: "Çan'ın Sesi",
    feedUrl: 'https://www.caninsesi.com.tr/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'canakkale', cityName: 'Çanakkale', district: 'Çan' },
  },
  {
    id: 'portal-gelibolu-gaste',
    label: 'Gelibolu Gaşte',
    feedUrl: 'https://www.gelibolugaste.com/feed',
    maxItemsPerRun: 3,
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
  // ── Çorum ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-corum-haber',
    label: 'Çorum Haber',
    feedUrl: 'https://www.corumhaber.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Çorum haber site:corumhaber.net')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'corum', cityName: 'Çorum' },
  },
  // ── Çankırı ───────────────────────────────────────────────────────────────
  {
    id: 'portal-cankiri-postasi',
    label: 'Çankırı Postası',
    feedUrl: 'https://www.cankiripostasi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Çankırı haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'cankiri', cityName: 'Çankırı' },
  },
  // ── Denizli ───────────────────────────────────────────────────────────────
  {
    id: 'portal-denizli-gazetesehir',
    label: 'Gazete Şehir Denizli',
    feedUrl: 'https://www.gazetesehir.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Denizli haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'denizli', cityName: 'Denizli' },
  },
  // ── Diyarbakır ────────────────────────────────────────────────────────────
  {
    id: 'portal-diyarbakir-haber',
    label: 'Diyarbakır Haber',
    feedUrl: 'https://www.diyarbakirhaber.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Diyarbakır haber site:diyarbakirhaber.net')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'diyarbakir', cityName: 'Diyarbakır' },
  },
  // ── Düzce ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-duzce-haber',
    label: 'Düzce Haber',
    feedUrl: 'https://www.duzcehaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Düzce haber site:duzcehaber.com')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'duzce', cityName: 'Düzce' },
  },
  // ── Edirne ────────────────────────────────────────────────────────────────
  {
    id: 'portal-edirne-haber',
    label: 'Edirne Haber',
    feedUrl: 'https://www.edirnehaber.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Edirne haber site:edirnehaber.net')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'edirne', cityName: 'Edirne' },
  },
  // ── Elazığ ────────────────────────────────────────────────────────────────
  {
    id: 'portal-elazig-haber',
    label: 'Elazığ Son Söz',
    feedUrl: 'https://www.elazigsonsoz.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Elazığ haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'elazig', cityName: 'Elazığ' },
  },
  // ── Erzincan ──────────────────────────────────────────────────────────────
  {
    id: 'portal-erzincan-haber',
    label: 'Erzincan Haber',
    feedUrl: 'https://www.erzincanhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Erzincan haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'erzincan', cityName: 'Erzincan' },
  },
  // ── Erzurum ───────────────────────────────────────────────────────────────
  {
    id: 'portal-erzurum-haber',
    label: 'Erzurum Haber',
    feedUrl: 'https://www.erzurumhaber.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Erzurum haber site:erzurumhaber.com.tr')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'erzurum', cityName: 'Erzurum' },
  },
  // ── Eskişehir ─────────────────────────────────────────────────────────────
  {
    id: 'portal-eskisehir-net',
    label: 'Eskişehir.net',
    feedUrl: 'https://www.eskisehir.net/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'eskisehir', cityName: 'Eskişehir' },
  },
  // ── Gaziantep ─────────────────────────────────────────────────────────────
  {
    id: 'portal-gaziantep-baba',
    label: 'Baba Haber Gaziantep',
    feedUrl: 'https://www.babahaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Gaziantep haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'gaziantep', cityName: 'Gaziantep' },
  },
  {
    id: 'portal-gaziantep27-net',
    label: 'Gaziantep 27',
    feedUrl: 'https://www.gaziantep27.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Gaziantep haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'gaziantep', cityName: 'Gaziantep' },
  },
  // ── Giresun ───────────────────────────────────────────────────────────────
  {
    id: 'portal-giresun-oncu',
    label: 'Giresun Öncü',
    feedUrl: 'https://www.giresunoncu.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Giresun haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'giresun', cityName: 'Giresun' },
  },
  {
    id: 'portal-giresun-yeni',
    label: 'Yeni Giresun',
    feedUrl: 'https://www.yenigiresun.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Giresun haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'giresun', cityName: 'Giresun' },
  },
  // ── Gümüşhane ─────────────────────────────────────────────────────────────
  {
    id: 'portal-gumushane-koza',
    label: 'Gümüş Koza',
    feedUrl: 'https://www.gumuskoza.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Gümüşhane haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'gumushane', cityName: 'Gümüşhane' },
  },
  {
    id: 'portal-gumushane-haber29',
    label: 'Haber 29 Gümüşhane',
    feedUrl: 'https://www.haber29.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Gümüşhane haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'gumushane', cityName: 'Gümüşhane' },
  },
  // ── Hakkari ───────────────────────────────────────────────────────────────
  {
    id: 'portal-hakkari-ajans30',
    label: 'Ajans 30 Hakkari',
    feedUrl: 'https://www.ajans30.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Hakkari haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'hakkari', cityName: 'Hakkari' },
  },
  {
    id: 'portal-hakkari-haber',
    label: 'Hakkari Haber',
    feedUrl: 'https://www.haberhakkari.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Hakkari haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'hakkari', cityName: 'Hakkari' },
  },
  // ── Hatay ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-hatay-haber',
    label: 'Hatay Haber',
    feedUrl: 'https://www.hatayhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Hatay haber site:hatayhaber.com')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'hatay', cityName: 'Hatay' },
  },
  // ── Isparta ───────────────────────────────────────────────────────────────
  {
    id: 'portal-isparta-demokrat32',
    label: 'Demokrat 32',
    feedUrl: 'https://www.demokrat32.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Isparta haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'isparta', cityName: 'Isparta' },
  },
  {
    id: 'portal-isparta-haber32',
    label: 'Haber 32 Isparta',
    feedUrl: 'https://www.haber32.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Isparta haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'isparta', cityName: 'Isparta' },
  },
  // ── İstanbul ──────────────────────────────────────────────────────────────
  {
    id: 'portal-istanbul-gazetesi',
    label: 'İstanbul Gazetesi',
    feedUrl: 'https://www.istanbulgazetesi.com.tr/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'istanbul', cityName: 'İstanbul' },
  },
  // ── İzmir ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-izmir-haberleri',
    label: 'İzmir Haberleri',
    feedUrl: 'https://www.izmirhaberleri.com/rss/news',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'izmir', cityName: 'İzmir' },
  },
  // ── Kahramanmaraş ─────────────────────────────────────────────────────────
  {
    id: 'portal-kahramanmaras-haber',
    label: 'Kahramanmaraş Haber',
    feedUrl: 'https://www.kahramanmarashaber.com/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kahramanmaras', cityName: 'Kahramanmaraş' },
  },
  // ── Karabük ───────────────────────────────────────────────────────────────
  {
    id: 'portal-karabuk-derinhaber',
    label: 'Karabük Derin Haber',
    feedUrl: 'https://www.karabukderinhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Karabük haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'karabuk', cityName: 'Karabük' },
  },
  {
    id: 'portal-karabuk-nethaber',
    label: 'Karabük Net Haber',
    feedUrl: 'https://www.karabuknethaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Karabük haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'karabuk', cityName: 'Karabük' },
  },
  // ── Karaman ───────────────────────────────────────────────────────────────
  {
    id: 'portal-karaman-24',
    label: 'Karaman 24',
    feedUrl: 'https://www.karaman24.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Karaman haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'karaman', cityName: 'Karaman' },
  },
  {
    id: 'portal-karaman-haber',
    label: 'Karaman Haber',
    feedUrl: 'https://www.karamanhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Karaman haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'karaman', cityName: 'Karaman' },
  },
  // ── Kastamonu ─────────────────────────────────────────────────────────────
  {
    id: 'portal-kastamonu-haber',
    label: 'Kastamonu Haber',
    feedUrl: 'https://www.kastamonuhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kastamonu haber site:kastamonuhaber.com')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kastamonu', cityName: 'Kastamonu' },
  },
  // ── Kayseri ───────────────────────────────────────────────────────────────
  {
    id: 'portal-kayseri-gunaydin',
    label: 'Kayseri Günaydın',
    feedUrl: 'https://www.kayserigunaydin.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kayseri haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kayseri', cityName: 'Kayseri' },
  },
  {
    id: 'portal-kayseri-kayserim',
    label: 'Kayserim.net',
    feedUrl: 'https://www.kayserim.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kayseri haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kayseri', cityName: 'Kayseri' },
  },
  // ── Kırıkkale ─────────────────────────────────────────────────────────────
  {
    id: 'portal-kirikkale-kalehaber',
    label: 'Kale Haber Kırıkkale',
    feedUrl: 'https://www.kalehaber.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kırıkkale haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kirikkale', cityName: 'Kırıkkale' },
  },
  {
    id: 'portal-kirikkale-manset',
    label: 'Manşet Gazetesi Kırıkkale',
    feedUrl: 'https://www.mansetgazetesi.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kırıkkale haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kirikkale', cityName: 'Kırıkkale' },
  },
  // ── Kırklareli ────────────────────────────────────────────────────────────
  {
    id: 'portal-kirklareli-alternatif',
    label: 'Alternatif Gazetesi Kırklareli',
    feedUrl: 'https://www.alternatifgazetesi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kırklareli haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kirklareli', cityName: 'Kırklareli' },
  },
  {
    id: 'portal-kirklareli-trakya',
    label: 'Trakya Gazetesi Kırklareli',
    feedUrl: 'https://www.trakyagazetesi.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kırklareli haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kirklareli', cityName: 'Kırklareli' },
  },
  // ── Kırşehir ──────────────────────────────────────────────────────────────
  {
    id: 'portal-kirsehir-cigdem',
    label: 'Kırşehir Çiğdem',
    feedUrl: 'https://www.kirsehircigdem.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kırşehir haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kirsehir', cityName: 'Kırşehir' },
  },
  {
    id: 'portal-kirsehir-memleket',
    label: 'Kırşehir Memleket',
    feedUrl: 'https://www.kirsehirmemleket.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kırşehir haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kirsehir', cityName: 'Kırşehir' },
  },
  // ── Kocaeli ───────────────────────────────────────────────────────────────
  {
    id: 'portal-kocaeli-bizimgazete',
    label: 'Bizim Gazete Kocaeli',
    feedUrl: 'https://www.bizimgazete.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kocaeli haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kocaeli', cityName: 'Kocaeli' },
  },
  {
    id: 'portal-kocaeli-bugun',
    label: 'Bugün Kocaeli',
    feedUrl: 'https://www.bugunkocaeli.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kocaeli haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kocaeli', cityName: 'Kocaeli' },
  },
  // ── Konya ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-konya-anadolu-bugun',
    label: 'Anadoluda Bugün Konya',
    feedUrl: 'https://www.anadoludabugun.com.tr/rss.xml',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Konya haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'konya', cityName: 'Konya' },
  },
  {
    id: 'portal-konya-eregli',
    label: 'Ereğli Haberleri Konya',
    feedUrl: 'https://www.ereglihaberleri.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Konya Ereğli haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'konya', cityName: 'Konya' },
  },
  // ── Kütahya ───────────────────────────────────────────────────────────────
  {
    id: 'portal-kutahya-dumlupinar',
    label: 'Dumlupınar Gazetesi Kütahya',
    feedUrl: 'https://www.dumlupinargazetesi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kütahya haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kutahya', cityName: 'Kütahya' },
  },
  {
    id: 'portal-kutahya-ekspres',
    label: 'Kütahya Ekspres',
    feedUrl: 'https://www.kutahyaekspres.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Kütahya haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'kutahya', cityName: 'Kütahya' },
  },
  // ── Malatya ───────────────────────────────────────────────────────────────
  {
    id: 'portal-malatya-haber',
    label: 'Malatya Haber',
    feedUrl: 'https://www.malatyahaber.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Malatya haber site:malatyahaber.com.tr')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'malatya', cityName: 'Malatya' },
  },
  // ── Manisa ────────────────────────────────────────────────────────────────
  {
    id: 'portal-manisa-haber',
    label: 'Manisa Haber',
    feedUrl: 'https://www.manisahaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Manisa haber site:manisahaber.com')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'manisa', cityName: 'Manisa' },
  },
  // ── Mardin ────────────────────────────────────────────────────────────────
  {
    id: 'portal-mardin-haber',
    label: 'Mardin Haber',
    feedUrl: 'https://www.mardinhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Mardin haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'mardin', cityName: 'Mardin' },
  },
  // ── Mersin ────────────────────────────────────────────────────────────────
  {
    id: 'portal-haber-mersin',
    label: 'Haber Mersin',
    feedUrl: 'https://www.habermersin.com/rss',
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'mersin', cityName: 'Mersin' },
  },
  // ── Muğla ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-mugla-haber',
    label: 'Muğla Haber',
    feedUrl: 'https://www.muglahaber.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Muğla haber site:muglahaber.com.tr')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'mugla', cityName: 'Muğla' },
  },
  // ── Nevşehir ──────────────────────────────────────────────────────────────
  {
    id: 'portal-nevsehir-haber',
    label: 'Nevşehir Haber',
    feedUrl: 'https://www.nevsehirhaber.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Nevşehir haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'nevsehir', cityName: 'Nevşehir' },
  },
  // ── Niğde ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-nigde-borhaber',
    label: 'Bor Haber Niğde',
    feedUrl: 'https://www.borhaber.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Niğde haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'nigde', cityName: 'Niğde' },
  },
  {
    id: 'portal-nigde-haber',
    label: 'Niğde Haber',
    feedUrl: 'https://www.nigdehaber.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Niğde haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'nigde', cityName: 'Niğde' },
  },
  // ── Ordu ──────────────────────────────────────────────────────────────────
  {
    id: 'portal-ordu-haber',
    label: 'Ordu Haber',
    feedUrl: 'https://www.orduhaber.net/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Ordu haber site:orduhaber.net')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'ordu', cityName: 'Ordu' },
  },
  // ── Osmaniye ──────────────────────────────────────────────────────────────
  {
    id: 'portal-osmaniye-hasret',
    label: 'Hasret Gazetesi Osmaniye',
    feedUrl: 'https://www.hasretgazetesi.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Osmaniye haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'osmaniye', cityName: 'Osmaniye' },
  },
  {
    id: 'portal-osmaniye-sabir',
    label: 'Sabır Gazetesi Osmaniye',
    feedUrl: 'https://www.sabirgazetesi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Osmaniye haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'osmaniye', cityName: 'Osmaniye' },
  },
  // ── Rize ──────────────────────────────────────────────────────────────────
  {
    id: 'portal-rize-haber',
    label: 'Rize Haber',
    feedUrl: 'https://www.rizehaber.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Rize haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'rize', cityName: 'Rize' },
  },
  // ── Sakarya ───────────────────────────────────────────────────────────────
  {
    id: 'portal-sakarya-haber',
    label: 'Sakarya Haber',
    feedUrl: 'https://www.sakaryahaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Sakarya haber site:sakaryahaber.com')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'sakarya', cityName: 'Sakarya' },
  },
  // ── Samsun ────────────────────────────────────────────────────────────────
  {
    id: 'portal-samsun-haber',
    label: 'Samsun Haber',
    feedUrl: 'https://www.samsunhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Samsun haber site:samsunhaber.com')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'samsun', cityName: 'Samsun' },
  },
  // ── Siirt ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-siirt-medya',
    label: 'Medya Siirt',
    feedUrl: 'https://www.medyasiirt.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Siirt haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'siirt', cityName: 'Siirt' },
  },
  {
    id: 'portal-siirt-manset',
    label: 'Siirt Manşet',
    feedUrl: 'https://www.siirtmanset.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Siirt haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'siirt', cityName: 'Siirt' },
  },
  // ── Şanlıurfa ─────────────────────────────────────────────────────────────
  {
    id: 'portal-sanliurfa-haber',
    label: 'Şanlıurfa Gazetesi',
    feedUrl: 'https://www.sanliurfagazetesi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Şanlıurfa haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'sanliurfa', cityName: 'Şanlıurfa' },
  },
  // ── Şırnak ────────────────────────────────────────────────────────────────
  {
    id: 'portal-sirnak-ajans',
    label: 'Şırnak Ajans',
    feedUrl: 'https://www.sirnakajans.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Şırnak haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'sirnak', cityName: 'Şırnak' },
  },
  // ── Sinop ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-sinop-haber',
    label: 'Sinop Haber',
    feedUrl: 'https://www.sinophaber.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Sinop haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'sinop', cityName: 'Sinop' },
  },
  // ── Sivas ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-sivas-haber',
    label: 'Sivas Haber',
    feedUrl: 'https://www.sivashaber.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Sivas haber site:sivashaber.com.tr')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'sivas', cityName: 'Sivas' },
  },
  // ── Tekirdağ ──────────────────────────────────────────────────────────────
  {
    id: 'portal-tekirdag-haber',
    label: 'Tekirdağ Haber',
    feedUrl: 'https://www.tekirdaghaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Tekirdağ haber site:tekirdaghaber.com')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'tekirdag', cityName: 'Tekirdağ' },
  },
  // ── Tokat ─────────────────────────────────────────────────────────────────
  {
    id: 'portal-tokat-haber',
    label: 'Tokat Haber',
    feedUrl: 'https://www.tokathaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Tokat haber site:tokathaber.com')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'tokat', cityName: 'Tokat' },
  },
  // ── Trabzon ───────────────────────────────────────────────────────────────
  {
    id: 'portal-trabzon-61saat',
    label: '61 Saat Trabzon',
    feedUrl: 'https://www.61saat.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Trabzon haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'trabzon', cityName: 'Trabzon' },
  },
  {
    id: 'portal-trabzon-gunebakis',
    label: 'Güne Bakış Trabzon',
    feedUrl: 'https://www.gunebakis.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Trabzon haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'trabzon', cityName: 'Trabzon' },
  },
  // ── Tunceli ───────────────────────────────────────────────────────────────
  {
    id: 'portal-tunceli-emek',
    label: 'Tunceli Emek',
    feedUrl: 'https://www.tunceliemek.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Tunceli haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'tunceli', cityName: 'Tunceli' },
  },
  {
    id: 'portal-tunceli-postasi',
    label: 'Tunceli Postası',
    feedUrl: 'https://www.tuncelipostasi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Tunceli haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'tunceli', cityName: 'Tunceli' },
  },
  // ── Uşak ──────────────────────────────────────────────────────────────────
  {
    id: 'portal-usak-egedeyenigun',
    label: 'Egede Yenigün Uşak',
    feedUrl: 'https://www.egedeyenigun.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Uşak haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'usak', cityName: 'Uşak' },
  },
  {
    id: 'portal-usak-haberajansi',
    label: 'Uşak Haber Ajansı',
    feedUrl: 'https://www.usakhaberajansi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Uşak haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'usak', cityName: 'Uşak' },
  },
  // ── Van ───────────────────────────────────────────────────────────────────
  {
    id: 'portal-van-sehri',
    label: 'Şehri Van Gazetesi',
    feedUrl: 'https://www.sehrivangazetesi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Van haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'van', cityName: 'Van' },
  },
  {
    id: 'portal-van-havadis',
    label: 'Van Havadis',
    feedUrl: 'https://www.vanhavadis.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Van haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'van', cityName: 'Van' },
  },
  // ── Yalova ────────────────────────────────────────────────────────────────
  {
    id: 'portal-yalova-gazetesi',
    label: 'Yalova Gazetesi',
    feedUrl: 'https://www.yalovagazetesi.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Yalova haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'yalova', cityName: 'Yalova' },
  },
  {
    id: 'portal-yalova-manset',
    label: 'Manşet Yalova',
    feedUrl: 'https://www.manset.com.tr/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Yalova haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'yalova', cityName: 'Yalova' },
  },
  // ── Yozgat ────────────────────────────────────────────────────────────────
  {
    id: 'portal-yozgat-haber',
    label: 'Yozgat Haber',
    feedUrl: 'https://www.yozgathaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Yozgat haber')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'yozgat', cityName: 'Yozgat' },
  },
  // ── Zonguldak ─────────────────────────────────────────────────────────────
  {
    id: 'portal-zonguldak-haber',
    label: 'Zonguldak Haber',
    feedUrl: 'https://www.zonguldakhaber.com/rss',
    alternateFeedUrls: [buildGoogleNewsFeedUrl('Zonguldak haber site:zonguldakhaber.com')],
    maxItemsPerRun: 3,
    enabled: true,
    localMeta: { citySlug: 'zonguldak', cityName: 'Zonguldak' },
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
    'istanbul,ankara,izmir,canakkale,antalya,manavgat,bursa,gaziantep,konya,mersin,kayseri,trabzon,samsun,kocaeli,diyarbakir'
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
  /** Include haberler.com city RSS for all selected provinces (default: true). */
  includeHaberlerCom?: boolean
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
  const includeHaberlerCom = options.includeHaberlerCom !== false

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

  // 1. Google News per province (backbone — always on, catches everything)
  const sources: LocalFeedSource[] = provinces.map((p) =>
    buildGoogleNewsSource(p, itemsPerSource)
  )

  // 2. haberler.com per province (city aggregator — higher signal, default on)
  if (includeHaberlerCom) {
    for (const province of provinces) {
      sources.push(buildHaberlerComSource(province, Math.min(itemsPerSource, 3)))
    }
  }

  // 3. District-level Google News sources for priority slugs below province level
  for (const slug of priority) {
    if (isTurkishProvinceSlug(slug)) continue
    const districtSource = buildGoogleNewsDistrictSource(slug, itemsPerSource)
    if (districtSource) sources.push(districtSource)
  }

  // 4. Curated local portals (LOCAL_PORTAL_FEEDS filtered to selected provinces)
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

  // 5. AA regional Google News (optional, default off — expensive, usually redundant)
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
  haberlerComProvinces: number
  localPortals: number
  totalCatalog: number
} {
  const googleNewsProvinces = TURKISH_PROVINCES.length
  const haberlerComProvinces = TURKISH_PROVINCES.length
  const localPortals = LOCAL_PORTAL_FEEDS.length
  return {
    googleNewsProvinces,
    haberlerComProvinces,
    localPortals,
    totalCatalog: googleNewsProvinces + haberlerComProvinces + localPortals + 1,
  }
}
