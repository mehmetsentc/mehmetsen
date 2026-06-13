import type { EditorId, EditorMetadata } from '@/services/newsroom/types'

/** Auto-publish unless fact-check confidence drops below this (draft queue). */
export const NEWSROOM_AUTO_PUBLISH_THRESHOLD = Number(
  process.env.NEWSROOM_AUTO_PUBLISH_THRESHOLD ?? 70
)

/** Items below this score are flagged for admin review and held in newsDrafts. */
export const NEWSROOM_LOW_CONFIDENCE_THRESHOLD = 50

export const MAX_AI_CALLS_PER_EDITOR = Number(process.env.NEWS_INGEST_MAX_AI_CALLS ?? 12)

/** Wire + regional Turkish sources — local worker. */
export const LOCAL_NEWS_SOURCE_IDS = ['aa', 'iha', 'dha'] as const

/**
 * Kaç il Google News feed'i çekilsin.
 * Odak: Çanakkale + büyük şehirler → 5 yeterli.
 * Tüm 81 ili taramak gereksiz Firestore fingerprint yazımı yaratır.
 */
export const LOCAL_NEWS_DEFAULT_MAX_PROVINCES = Number(
  process.env.LOCAL_NEWS_MAX_PROVINCES ?? 5
)

/**
 * Türk ulusal kaynakları — 7 çekirdek kaynak (overlap temizlendi).
 * Kaldırılanlar: milliyet/sabah/yenisafak/karar (hurriyet/sozcu'yla overlap),
 * independent-tr/gazeteduvar (küçük kitle), euronews-tr (world worker'da var).
 */
export const NATIONAL_NEWS_SOURCE_IDS = [
  'trt', 'ntv', 'haberturk', 'hurriyet', 'sozcu', 'cumhuriyet', 't24',
] as const

/**
 * Son dakika kaynakları — acil + güvenilir (10 kaynak → 6).
 * Kaldırılanlar: ntv/haberturk (national'da var), aljazeera (world'de var),
 * reuters (URL bug vardı, reuters-world yeterli).
 */
export const BREAKING_NEWS_SOURCE_IDS = [
  'cnn', 'bbc', 'reuters-world', 'ap-news', 'trt',
] as const

/**
 * Uluslararası haberler — 5 kaynak (12'den).
 * Kaldırılanlar: guardian/dw-english/sky-news (overlap), bbc (bbc-world'le aynı),
 * nyt-world/wapo-world (paywall), france24-en (az çıkar).
 */
export const WORLD_NEWS_SOURCE_IDS = [
  'reuters-world', 'ap-news', 'aljazeera', 'bbc-world', 'euronews-tr',
] as const

/**
 * Teknoloji kaynakları — 5 çekirdek (14'ten).
 * Kaldırılanlar: wired/arstechnica/venturebeat/mit-tech (nişe çok spesifik),
 * openai/google/microsoft/apple blogları (pazarlama içeriği), chip-tr (Google News).
 */
export const TECH_NEWS_SOURCE_IDS = [
  'techcrunch', 'theverge', 'shiftdelete', 'webtekno', 'donanimhaber',
] as const

/**
 * Spor kaynakları — 5 Türk çekirdek (15'ten).
 * Kaldırılanlar: hurriyet-spor/haberturk-spor/milliyet-spor (overlap),
 * goal-tr/f1-espn/bbc-sport/espn-soccer/transfermarkt-news/uefa-news/takvim-spor
 * (İngilizce veya Google News arama sorguları).
 */
export const SPORTS_NEWS_SOURCE_IDS = [
  'fanatik', 'fotomac', 'ajansspor', 'ntv-spor', 'trt-spor',
] as const

/**
 * Sağlık kaynakları — 4 kaynak (9'dan).
 * Kaldırılanlar: nih-news/nature-news/science-daily/lancet/cdc-news
 * (akademik, Türk kitlesiyle düşük alakası).
 */
export const HEALTH_NEWS_SOURCE_IDS = [
  'who-news', 'saglik-tr', 'medimagazin', 'saglik-aktuel',
] as const

/**
 * Siyaset kaynakları — 4 kaynak (11'den, overlap temizlendi).
 * Kaldırılanlar: haberturk-politika/trt-politika (national'daki haberturk/trt ile aynı),
 * milliyet-siyaset/hurriyet-siyaset (national'dakilerin politika feed'i zaten benzer),
 * cumhuriyet/gazeteduvar (national'da var), bbc/euronews-tr (world'de var).
 */
export const POLITICS_NEWS_SOURCE_IDS = [
  'anka-haber', 'ntv-politika', 'aa-siyaset', 't24',
] as const

/**
 * Magazin kaynakları — 3 Türk kaynak (9'dan).
 * Kaldırılanlar: hurriyet-magazin/takvim-magazin (overlap),
 * variety/billboard/tmz-news/hollywood-reporter (Amerikan eğlence → Türk okuyucuyla alakasız).
 */
export const MAGAZINE_NEWS_SOURCE_IDS = [
  'milliyet-magazin', 'sabah-magazin', 'posta-magazin',
] as const

/**
 * Finans kaynakları — 3 Türk kaynak (7'den).
 * Kaldırılanlar: ekonomim/haberturk-ekonomi (ntv-ekonomi ile overlap),
 * bloomberg-int/cnbc-int (İngilizce, Türk finans kitlesi için düşük değer).
 */
export const FINANS_SOURCE_IDS = [
  'bloomberght', 'dunya-ekonomi', 'ntv-ekonomi',
] as const

export const EDITOR_REGISTRY: Record<EditorId, EditorMetadata> = {
  'local-news': {
    id: 'local-news',
    name: 'Local News Worker',
    nameTr: 'Yerel Haber Worker',
    schedule: '10m',
    description: 'AA, DHA, İHA — şehir/ilçe odaklı haberler; fingerprint diff → queue → auto-publish.',
    cronPath: '/api/cron/newsroom/local',
  },
  'national-news': {
    id: 'national-news',
    name: 'National News Worker',
    nameTr: 'Ulusal Haber Worker',
    schedule: '5m',
    description: 'TRT, NTV, Habertürk, Sözcü, T24, Gazete Duvar — ulusal gündem; auto-publish.',
    cronPath: '/api/cron/newsroom/national',
  },
  'breaking-news': {
    id: 'breaking-news',
    name: 'Breaking News Worker',
    nameTr: 'Son Dakika Worker',
    schedule: '2m',
    description: 'CNN, BBC, Reuters + acil ulusal kaynaklar — breakingScore ile feed pin.',
    cronPath: '/api/cron/newsroom/breaking',
  },
  trend: {
    id: 'trend',
    name: 'Trend Worker',
    nameTr: 'Trend Worker',
    schedule: '15m',
    description: 'Google Trends gündem — "Neden trend?" formatı; auto-publish.',
    cronPath: '/api/cron/newsroom/trend',
  },
  influencer: {
    id: 'influencer',
    name: 'Influencer Worker',
    nameTr: 'Influencer Worker',
    schedule: '30m',
    description: 'Yapılandırılmış influencer listesinden OpenAI araştırma; auto-publish.',
    cronPath: '/api/cron/newsroom/influencer',
  },
  event: {
    id: 'event',
    name: 'Event Editor',
    nameTr: 'Etkinlik Editörü',
    schedule: 'daily',
    description: 'Bilet platformlarından günlük etkinlik senkronizasyonu.',
    cronPath: '/api/events/sync',
  },
  'fact-checker': {
    id: 'fact-checker',
    name: 'Fact Checker',
    nameTr: 'Doğruluk Kontrolü',
    schedule: 'pipeline',
    description: 'Pipeline confidenceScore (0–100); <50 → newsDrafts review queue.',
  },
  'category-engine': {
    id: 'category-engine',
    name: 'Category Engine',
    nameTr: 'Kategori Motoru',
    schedule: 'pipeline',
    description: 'AI kategori ataması — son-dakika, trend, influencer, gündem vb.',
  },
  'geo-engine': {
    id: 'geo-engine',
    name: 'Geo Engine',
    nameTr: 'Coğrafi Motor',
    schedule: 'pipeline',
    description: 'İl, ilçe ve ülke çıkarımı; citySlug ve etiket zenginleştirme.',
  },
  archive: {
    id: 'archive',
    name: 'Archive Editor',
    nameTr: 'Arşiv ve Temizlik',
    schedule: 'daily',
    description: '24 saatte bir eski haberleri arşivler, yinelenen taslakları temizler.',
    cronPath: '/api/cron/newsroom/archive',
  },
  'afad-deprem': {
    id: 'afad-deprem',
    name: 'AFAD Earthquake Worker',
    nameTr: 'AFAD Deprem Worker',
    schedule: '2m',
    description: 'AFAD API\'den M4.0+ depremleri çeker, son-dakika olarak yayınlar.',
    cronPath: '/api/cron/newsroom/afad',
  },
  finans: {
    id: 'finans',
    name: 'Finance Worker',
    nameTr: 'Finans Worker',
    schedule: '30m',
    description: 'BloombergHT, Dünya, Ekonomim — finansal haberler; ekonomi kategorisi.',
    cronPath: '/api/cron/newsroom/finans',
  },
  kripto: {
    id: 'kripto',
    name: 'Crypto Worker',
    nameTr: 'Kripto Worker',
    schedule: '30m',
    description: 'CoinDesk, CoinTelegraph, Kriptokoin — kripto para haberleri.',
    cronPath: '/api/cron/newsroom/kripto',
  },
  'video-queue': {
    id: 'video-queue',
    name: 'Video Queue Enqueuer',
    nameTr: 'Video Kuyruğa Ekleme',
    schedule: '6h',
    description: '6 saatte bir yeni haberleri video üretim kuyruğuna ekler.',
    cronPath: '/api/cron/newsroom/video-queue',
  },
  'video-process': {
    id: 'video-process',
    name: 'AI Video Script Processor',
    nameTr: 'AI Video Senaryo Üretici',
    schedule: '30m',
    description: '30 dakikada bir videoQueue\'dan bekleyen maddeleri alır, AI senaryo üretir, videos koleksiyonuna yazar.',
    cronPath: '/api/cron/newsroom/video-process',
  },
  entertainment: {
    id: 'entertainment',
    name: 'Entertainment Worker',
    nameTr: 'Eğlence/Magazin Worker',
    schedule: '1h',
    description: 'Magazin, eğlence, kültür-sanat ve spor haberleri; saatte bir çalışır.',
    cronPath: '/api/cron/newsroom/entertainment',
  },
  'seo-maintenance': {
    id: 'seo-maintenance',
    name: 'SEO Maintenance Worker',
    nameTr: 'SEO Bakım Worker',
    schedule: 'daily',
    description: '24 saatte bir: eksik slug/seo alanlarını tamamlar, düşük kaliteli taslakları temizler.',
    cronPath: '/api/cron/newsroom/seo',
  },
  weather: {
    id: 'weather',
    name: 'Weather News Worker',
    nameTr: 'Hava Durumu Worker',
    schedule: '15m',
    description: '15 dakikada bir büyük iller için hava durumu haberlerini günceller.',
    cronPath: '/api/cron/newsroom/weather',
  },
  'world-news': {
    id: 'world-news',
    name: 'World News Worker',
    nameTr: 'Dünya Haberleri Worker',
    schedule: '5m',
    description: 'Reuters, AP, Al Jazeera, Guardian, NYT, WaPo — uluslararası haberler, Türkçe yeniden yazma.',
    cronPath: '/api/cron/newsroom/world',
  },
  'tech-news': {
    id: 'tech-news',
    name: 'Technology Worker',
    nameTr: 'Teknoloji Worker',
    schedule: '10m',
    description: 'TechCrunch, Verge, Wired, OpenAI, Google, Microsoft, Apple — teknoloji ve yapay zeka haberleri.',
    cronPath: '/api/cron/newsroom/technology',
  },
  'sports-news': {
    id: 'sports-news',
    name: 'Sports Worker',
    nameTr: 'Spor Worker',
    schedule: '5m',
    description: 'Fanatik, Fotomaç, Sporx, TRT Spor, BBC Sport — futbol, basketbol, F1, transfer haberleri.',
    cronPath: '/api/cron/newsroom/sports',
  },
  'health-news': {
    id: 'health-news',
    name: 'Health & Science Worker',
    nameTr: 'Sağlık & Bilim Worker',
    schedule: '15m',
    description: 'WHO, CDC, NIH, The Lancet, Nature — sağlık ve bilim haberleri, Türkçe yeniden yazma.',
    cronPath: '/api/cron/newsroom/health',
  },
  'politics-news': {
    id: 'politics-news',
    name: 'Politics Worker',
    nameTr: 'Siyaset Worker',
    schedule: '5m',
    description: 'ANKA, AA, NTV, Habertürk, Cumhuriyet — TBMM, hükümet, seçim, dış politika haberleri.',
    cronPath: '/api/cron/newsroom/politics',
  },
  'magazine-news': {
    id: 'magazine-news',
    name: 'Magazine Worker',
    nameTr: 'Magazin Worker',
    schedule: '15m',
    description: 'Milliyet Magazin, Posta, Variety, Billboard, TMZ — ünlüler, eğlence, müzik, sinema.',
    cronPath: '/api/cron/newsroom/magazine',
  },
  recategorize: {
    id: 'recategorize',
    name: 'Recategorize Worker',
    nameTr: 'Yeniden Kategorileme',
    schedule: 'daily',
    description: 'Düşük güvenilirlikli kategorileri GPT + heuristic ile düzeltir.',
    cronPath: '/api/admin/recategorize',
  },
}

export function getInfluencerList(): string[] {
  const raw = process.env.NEWSROOM_INFLUENCERS?.trim()
  if (!raw) {
    return ['Cem Yılmaz', 'Hadise', 'Şeyma Subaşı']
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export function getTrendTopics(): string[] {
  const raw = process.env.NEWSROOM_TREND_TOPICS?.trim()
  if (!raw) {
    return ['Türkiye', 'İstanbul', 'ekonomi', 'futbol', 'seçim']
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
