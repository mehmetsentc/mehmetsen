import type { EditorId, EditorMetadata } from '@/services/newsroom/types'

/**
 * Master switch for AI auto-publish.
 * Default ON: confident AI "publish" → live + İnceleme (post-publish review).
 * AI "hold" / quality gate fail → newsDrafts pending_review ("Onay Bekliyor").
 * Kill switch: NEWSROOM_AUTO_PUBLISH_ENABLED=0 or false → everything stays in Onay Bekliyor.
 */
export const NEWSROOM_AUTO_PUBLISH_ENABLED =
  process.env.NEWSROOM_AUTO_PUBLISH_ENABLED !== '0' &&
  process.env.NEWSROOM_AUTO_PUBLISH_ENABLED !== 'false'

/** Auto-publish unless fact-check confidence drops below this (draft queue). */
export const NEWSROOM_AUTO_PUBLISH_THRESHOLD = Number(
  process.env.NEWSROOM_AUTO_PUBLISH_THRESHOLD ?? 60
)

/** Items below this score are flagged for admin review and held in newsDrafts. */
export const NEWSROOM_LOW_CONFIDENCE_THRESHOLD = Number(
  process.env.NEWSROOM_LOW_CONFIDENCE_THRESHOLD ?? 55
)

/**
 * AI Ana Editör otomatik yayın — false ise chief editor "publish" dese bile taslakta kalır.
 * Varsayılan: true (CHIEF_EDITOR_AUTO_PUBLISH=0 veya false ile kapatılır).
 */
export const CHIEF_EDITOR_AUTO_PUBLISH =
  process.env.CHIEF_EDITOR_AUTO_PUBLISH !== '0' &&
  process.env.CHIEF_EDITOR_AUTO_PUBLISH !== 'false'

/** Chief editor categoryConfidence/overallScore eşiği — altında hold (pending_review). */
export const CHIEF_EDITOR_CONFIDENCE_THRESHOLD = Number(
  process.env.CHIEF_EDITOR_CONFIDENCE_THRESHOLD ?? 72
)

/**
 * Gate/confidence düşükse Stage1'i kaç kez yeniden çalıştır.
 * 1 = ilk yazım + 1 düzeltme (varsayılan).
 */
export const NEWSROOM_REWRITE_MAX_RETRIES = Math.max(
  0,
  Math.min(3, Number(process.env.NEWSROOM_REWRITE_MAX_RETRIES ?? 2))
)

/**
 * Retry sonrası confidence eşiğini bu kadar gevşet (yalnızca gate=publish ise).
 * Örn. 60−10=50 → ikinci denemede 50+ yayınlanır.
 */
export const NEWSROOM_RETRY_CONFIDENCE_RELAX = Math.max(
  0,
  Math.min(20, Number(process.env.NEWSROOM_RETRY_CONFIDENCE_RELAX ?? 10))
)

/** Draft kuyruğundan otomatik yeniden işlenecek max belge / cron. */
export const NEWSROOM_DRAFT_REPROCESS_BATCH = Math.max(
  1,
  Math.min(20, Number(process.env.NEWSROOM_DRAFT_REPROCESS_BATCH ?? 8))
)

/** Aynı draft kaç kez otomatik yeniden denensin. */
export const NEWSROOM_DRAFT_REPROCESS_MAX_ATTEMPTS = Math.max(
  1,
  Math.min(5, Number(process.env.NEWSROOM_DRAFT_REPROCESS_MAX_ATTEMPTS ?? 2))
)

export const MAX_AI_CALLS_PER_EDITOR = Number(process.env.NEWS_INGEST_MAX_AI_CALLS ?? 12)

/** Wire + regional Turkish sources — local worker. */
export const LOCAL_NEWS_SOURCE_IDS = ['aa', 'dha', 'anka-haber'] as const

/**
 * Kaç il Google News feed'i çekilsin.
 * Her run'da 40 il taranır, saat bazlı rotasyon ile 81 ilin tamamı
 * ~2 run'da (yaklaşık 20 dakikada) kapsanır. 300s Vercel timeout'una sığar.
 * Vercel env: LOCAL_NEWS_MAX_PROVINCES ile override edilebilir.
 */
export const LOCAL_NEWS_DEFAULT_MAX_PROVINCES = Number(
  process.env.LOCAL_NEWS_MAX_PROVINCES ?? 40
)

/**
 * Türk ulusal kaynakları — yalnızca enabled RSS (2026-08-02 audit temizliği).
 * Kapalı: iha, hurriyet, ahaber, yeniakit, haberler, sondakika, mynet
 */
export const NATIONAL_NEWS_SOURCE_IDS = [
  'aa', 'dha', 'anka-haber',
  'trt', 'trt-manset', 'ntv', 'cnn', 'haberturk', 'sozcu',
  'ensonhaber', 'yeniasir', 'dw-turkish',
  'cumhuriyet', 't24',
] as const

/**
 * Son dakika kaynakları — yalnızca enabled RSS.
 * Kapalı: iha, hurriyet, bbc, trt-sondakika, haberler, sondakika
 */
export const BREAKING_NEWS_SOURCE_IDS = [
  'aa', 'dha', 'anka-haber',
  'ntv', 'cnn', 'haberturk', 'trt', 'trt-sondakika', 'sabah',
  'sabah-sondakika', 'milliyet-sondakika',
  'reuters-world', 'ap-news',
] as const

/**
 * Uluslararası haberler — yalnızca enabled RSS.
 * Kapalı: sputnik-tr, ahaber-dunya
 */
export const WORLD_NEWS_SOURCE_IDS = [
  'reuters-world', 'ap-news', 'aljazeera', 'bbc-world', 'euronews-tr',
  'dw-turkish', 'milliyet-dunya', 'sabah-dunya', 'trt-dunya',
] as const

/**
 * Teknoloji kaynakları — yalnızca enabled RSS.
 * Kapalı: donanimhaber, ahaber-teknoloji
 */
export const TECH_NEWS_SOURCE_IDS = [
  'techcrunch', 'theverge', 'shiftdelete', 'webtekno',
  'ntv-teknoloji', 'cnnturk-bilim', 'milliyet-teknoloji', 'sabah-teknoloji',
  'trt-bilim',
] as const

/**
 * Spor kaynakları — yalnızca enabled RSS.
 * Kapalı: ntv-spor, ahaber-spor
 */
export const SPORTS_NEWS_SOURCE_IDS = [
  'fanatik', 'fotomac', 'ajansspor', 'trt-spor',
  'sabah-spor', 'cnnturk-spor',
] as const

/**
 * Sağlık kaynakları — yalnızca enabled RSS.
 * Kapalı: medimagazin, saglik-aktuel, ahaber-saglik
 */
export const HEALTH_NEWS_SOURCE_IDS = [
  'who-news', 'saglik-tr',
  'ntv-saglik', 'cnnturk-saglik', 'milliyet-saglik', 'sabah-saglik', 'hurriyet-saglik',
  'trt-saglik',
] as const

/**
 * Siyaset kaynakları — yalnızca enabled RSS.
 * Kapalı: ntv-politika, aa-siyaset
 */
export const POLITICS_NEWS_SOURCE_IDS = [
  'anka-haber', 't24',
] as const

/**
 * Magazin kaynakları — yalnızca enabled RSS.
 * Kapalı: posta-magazin, hurriyet-magazin
 */
export const MAGAZINE_NEWS_SOURCE_IDS = [
  'milliyet-magazin', 'sabah-magazin',
  'takvim-magazin', 'cnnturk-kultur', 'cnnturk-yasam',
  'ntv-yasam', 'sabah-kultur-sanat', 'ntv-kultur',
  'trt-yasam', 'trt-kultur', 'trt-egitim',
  'gecce',
  'eventnews-kultur', 'eventnews-konser', 'eventnews-festival',
  'eventnews-etkinlik', 'eventnews-mekan',
] as const

/**
 * Finans kaynakları (config registry) — yalnızca enabled RSS.
 * Kapalı: bigpara, finansgundem, hurriyet-ekonomi, ahaber-ekonomi
 * Not: finansWorker.ts kendi listesini kullanır.
 */
export const FINANS_SOURCE_IDS = [
  'bloomberght', 'dunya-ekonomi', 'ntv-ekonomi',
  'milliyet-ekonomi', 'cnnturk-ekonomi', 'sabah-ekonomi',
  'trt-ekonomi',
] as const

/**
 * Gündem bot kaynakları — Google News TR + AA kategori feedleri + yüksek kaliteli son-dakika.
 * Kapalı: haberturk-sondakika
 */
export const GUNDEM_SOURCE_IDS = [
  'google-news-tr', 'google-news-tr-ulusal', 'google-news-tr-politika', 'google-news-tr-ekonomi',
  'aa-gundem', 'aa-politika', 'aa-ekonomi',
  'ntv-sondakika', 'cumhuriyet-gundem', 'iha-gundem',
] as const

/** Gastronomi kaynakları — yalnızca enabled RSS. Kapalı: yemek-com, hurriyet-gastronomi */
export const GASTRONOMI_SOURCE_IDS = [
  'gastronomi-google-news', 'lezzet-com', 'milliyet-gastronomi',
  'eventnews-gastronomi',
] as const

/** Otomobil kaynakları — yalnızca enabled RSS. Kapalı: oto-com-tr, arabalar-com-tr, hurriyet-otomobil */
export const OTOMOBIL_SOURCE_IDS = [
  'otomobil-google-news', 'otomobilhaber',
  'milliyet-otomobil', 'ntv-otomobil', 'cnnturk-otomobil', 'sabah-otomobil',
  'sozcu-otomotiv',
] as const

/** Turizm kaynakları — yalnızca enabled RSS. Kapalı: turizaktuel (2026-08-02 audit) */
export const TURIZM_SOURCE_IDS = [
  'turizm-google-news',
  'turizmgazetesi', 'turizmekonomi',
  'turizmajansi', 'turizmnews', 'turizmaktuel', 'turizmguncel',
  'tourismtoday',
  'aa-turizm', 'hurriyet-seyahat', 'ntv-seyahat', 'sabah-turizm',
  'eventnews-turizm',
] as const

/** Kıbrıs / KKTC kaynakları — yalnızca enabled RSS. Kapalı: diyalog-kibris, kibrisbulteni */
export const KIBRIS_SOURCE_IDS = [
  'kibris-google-news', 'kibris-kaza-google-news',
  'kibrisgazetesi', 'havadiskibris', 'kibrispostasi',
  'yeniduzen-kibris', 'starkibris',
  'bugunkibris', 'detaykibris', 'sondakikacyprus',
  'kibrisgercek', 'gundemkibris', 'haberkibris',
  'sondakika-kibris', 'polis-kktc',
] as const

/** Gezi kaynakları — destinasyon, rota, seyahat rehberi, keşif haberleri. */
export const GEZI_SOURCE_IDS = [
  'gezi-google-news', 'gezginler', 'milliyet-seyahat',
  'cnnturk-seyahat', 'lonely-planet-tr',
] as const

/** Sinema kaynakları — Box Office Türkiye Atom (sinema worker, forcedCategoryId: sinema). */
export const SINEMA_SOURCE_IDS = ['box-office-turkiye'] as const

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
  'chief-editor': {
    id: 'chief-editor',
    name: 'Chief Editor',
    nameTr: 'Ana Editör',
    schedule: 'pipeline',
    description:
      'Pipeline final gate — duplikat / kategori / yayın kararı; isDuplicate → newsDrafts stub, yayın yok.',
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
  'thin-content-backfill': {
    id: 'thin-content-backfill',
    name: 'Thin Content Backfill',
    nameTr: 'İnce İçerik Tamamlama',
    schedule: '6h',
    description: 'İçeriği kısa yayınlanmış haberleri Jina+arama ile çekip AI ile yeniden yazar.',
    cronPath: '/api/cron/newsroom/thin-content-backfill',
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
  'sinema-news': {
    id: 'sinema-news',
    name: 'Sinema Worker',
    nameTr: 'Sinema Worker',
    schedule: '4h',
    description: 'Box Office Türkiye Atom — vizyon, gişe, film/dizi haberleri (AI editör, sinema kategorisi).',
    cronPath: '/api/cron/newsroom/sinema',
  },
  recategorize: {
    id: 'recategorize',
    name: 'Recategorize Worker',
    nameTr: 'Yeniden Kategorileme',
    schedule: 'daily',
    description: 'Düşük güvenilirlikli kategorileri GPT + heuristic ile düzeltir.',
    cronPath: '/api/admin/recategorize',
  },
  'gastronomi-news': {
    id: 'gastronomi-news',
    name: 'Gastronomi Worker',
    nameTr: 'Gastronomi Worker',
    schedule: '30m',
    description: 'Lezzet.com, Yemek.com, Milliyet/Hürriyet Gastronomi — yemek, restoran, mutfak haberleri.',
    cronPath: '/api/cron/newsroom/gastronomi',
  },
  'otomobil-news': {
    id: 'otomobil-news',
    name: 'Otomobil Worker',
    nameTr: 'Otomobil Worker',
    schedule: '30m',
    description: 'Oto.com.tr, OtomobilHaber, Arabalar.com.tr, Hürriyet/Milliyet Otomobil — araç ve trafik haberleri.',
    cronPath: '/api/cron/newsroom/otomobil',
  },
  'turizm-news': {
    id: 'turizm-news',
    name: 'Turizm Worker',
    nameTr: 'Turizm Worker',
    schedule: '30m',
    description: 'Turizm Gazetesi, Turizm Aktüel, AA Turizm, Hürriyet/NTV/Sabah Seyahat — otel, tatil, tur operatörü haberleri.',
    cronPath: '/api/cron/newsroom/turizm',
  },
  'gezi-news': {
    id: 'gezi-news',
    name: 'Gezi Worker',
    nameTr: 'Gezi Worker',
    schedule: '1h',
    description: 'Gezginler.net, Milliyet/CNN Türk Seyahat, Lonely Planet — destinasyon, rota, seyahat rehberi haberleri.',
    cronPath: '/api/cron/newsroom/gezi',
  },
  'aa-content': {
    id: 'aa-content',
    name: 'AA Content Worker',
    nameTr: 'Anadolu Ajansı İçerik Worker',
    schedule: '1h',
    description: 'aa.com.tr/tr/gundem — her saat son 2 saatin haberlerini tam içerik + görsel ile çeker, doğrudan Firestore\'a yazar.',
    cronPath: '/api/cron/newsroom/aa-content',
  },
  'anka-breaking': {
    id: 'anka-breaking',
    name: 'ANKA Breaking Worker',
    nameTr: 'Anka Haber Son Dakika Worker',
    schedule: '10m',
    description: 'ankahaber.net/kategori/sondakika — 10 dakikada bir son 15 dakikanın son-dakika haberlerini tam içerik + görsel ile çeker.',
    cronPath: '/api/cron/newsroom/anka-breaking',
  },
  'anka-local': {
    id: 'anka-local',
    name: 'ANKA Local Worker',
    nameTr: 'Anka Haber Yerel Haberler Worker',
    schedule: '6h',
    description: 'ankahaber.net/kategori/yerel-haberler — TRT ile 06:00, 16:00, 18:00, 00:00\'da son 6 saatin yerel haberlerini tam içerik + görsel + video ile çeker.',
    cronPath: '/api/cron/newsroom/anka-local',
  },
  'world-cup-2026': {
    id: 'world-cup-2026',
    name: '2026 World Cup Worker (archive)',
    nameTr: '2026 FIFA Dünya Kupası Worker (arşiv — ingest kapalı)',
    schedule: 'off',
    description:
      'Post-tournament archive. Yeni ingest kapalı; dünya futbolu → futbol kategorisi.',
    cronPath: '/api/cron/newsroom/world-cup',
  },
  voleybol: {
    id: 'voleybol',
    name: 'Voleybol Worker',
    nameTr: 'Voleybol Worker',
    schedule: '1h',
    description: 'Sözcü Voleybol RSS — sadece voleybol kategorisine kaydeder.',
    cronPath: '/api/cron/newsroom/voleybol',
  },
  basketbol: {
    id: 'basketbol',
    name: 'Basketbol Worker',
    nameTr: 'Basketbol Worker',
    schedule: '1h',
    description: 'Sözcü Basketbol RSS — sadece basketbol kategorisine kaydeder.',
    cronPath: '/api/cron/newsroom/basketbol',
  },
  'futbol-sozcu': {
    id: 'futbol-sozcu',
    name: 'Futbol Sozcu Worker',
    nameTr: 'Sözcü Dünyadan Spor (Futbol) Worker',
    schedule: '1h',
    description: 'Sözcü Dünyadan Spor RSS — sadece futbol kategorisine kaydeder.',
    cronPath: '/api/cron/newsroom/futbol',
  },
  borsa: {
    id: 'borsa',
    name: 'Borsa Worker',
    nameTr: 'Borsa Worker',
    schedule: '1h',
    description: 'Sözcü Borsa RSS — sadece borsa kategorisine kaydeder. Ana feed\'e düşmez.',
    cronPath: '/api/cron/newsroom/borsa',
  },
  'bilim-teknoloji': {
    id: 'bilim-teknoloji',
    name: 'Bilim & Teknoloji Worker',
    nameTr: 'Sözcü Bilim & Teknoloji Worker',
    schedule: '1h',
    description: 'Sözcü Bilim-Teknoloji RSS — AI ile bilim veya teknoloji kategorisine yönlendirir.',
    cronPath: '/api/cron/newsroom/bilim-teknoloji',
  },
  'saglik-sozcu': {
    id: 'saglik-sozcu',
    name: 'Saglik Sozcu Worker',
    nameTr: 'Sözcü Sağlık Worker',
    schedule: '1h',
    description: 'Sözcü Sağlık RSS — sadece saglik kategorisine kaydeder.',
    cronPath: '/api/cron/newsroom/saglik-sozcu',
  },
  'sozcu-breaking': {
    id: 'sozcu-breaking',
    name: 'Sozcu Breaking Worker',
    nameTr: 'Sözcü Son Dakika Worker',
    schedule: '10m',
    description: 'Sözcü Son Dakika RSS — tam içerik scraping ile 10 dakikada bir son-dakika kategorisine kaydeder.',
    cronPath: '/api/cron/newsroom/sozcu-breaking',
  },
  gundem: {
    id: 'gundem',
    name: 'Gündem Bot',
    nameTr: 'Gündem Bot',
    schedule: '5m',
    description: 'Google News TR + AA kategori feedleri — ulusal kapsam filtresi ile tüm Türkiye\'yi ilgilendiren haberleri gündem kategorisine yayınlar.',
    cronPath: '/api/cron/newsroom/gundem',
  },
  hackernews: {
    id: 'hackernews',
    name: 'HackerNews Worker',
    nameTr: 'HackerNews',
    schedule: '10m',
    description: 'HackerNews beststories — score≥150 teknoloji/dünya haberlerini çeker, AI ile Türkçeye çevirir.',
    cronPath: '/api/cron/newsroom/technology',
  },
  freenews: {
    id: 'freenews',
    name: 'FreeNewsAPI Worker',
    nameTr: 'FreeNewsAPI',
    schedule: '30m',
    description: 'freenewsapi.io üzerinden Türkçe (language=tr) haberler çeker, AI ile yeniden yazar ve yayınlar.',
    cronPath: '/api/cron/newsroom/freenews',
  },
  'kibris-haberleri': {
    id: 'kibris-haberleri',
    name: 'Kıbrıs Haberleri Worker',
    nameTr: 'Kıbrıs / KKTC Haber Worker',
    schedule: '30m',
    description: 'Kıbrıs Gazetesi, Yeni Düzen, Havadis, Bugün Kıbrıs, Detay, Gündem Kıbrıs, KKTC Polis ve diğer KKTC kaynakları — kibris-haberleri kategorisine yayınlar.',
    cronPath: '/api/cron/newsroom/kibris',
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
