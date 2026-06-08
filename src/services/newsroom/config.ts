import type { EditorId, EditorMetadata } from '@/services/newsroom/types'

/** Auto-publish unless fact-check confidence drops below this (draft queue). */
export const NEWSROOM_AUTO_PUBLISH_THRESHOLD = Number(
  process.env.NEWSROOM_AUTO_PUBLISH_THRESHOLD ?? 70
)

/** Items below this score are flagged for admin review and held in newsDrafts. */
export const NEWSROOM_LOW_CONFIDENCE_THRESHOLD = 50

export const MAX_AI_CALLS_PER_EDITOR = Number(process.env.NEWS_INGEST_MAX_AI_CALLS ?? 12)

/** Wire + regional Turkish sources — local worker (10 min). */
export const LOCAL_NEWS_SOURCE_IDS = ['aa', 'iha', 'dha'] as const

/** Default province batch size per cron (full backfill uses 81). */
export const LOCAL_NEWS_DEFAULT_MAX_PROVINCES = Number(
  process.env.LOCAL_NEWS_MAX_PROVINCES ?? 20
)

/** Major Turkish national outlets — national worker (5 min). */
export const NATIONAL_NEWS_SOURCE_IDS = [
  'trt',
  'ntv',
  'haberturk',
  'hurriyet',
  'sozcu',
] as const

/** International + urgent national — breaking worker (2 min). */
export const BREAKING_NEWS_SOURCE_IDS = [
  'cnn',
  'bbc',
  'reuters',
  'trt',
  'ntv',
  'haberturk',
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
    name: 'Archive Editor (deprecated primary)',
    nameTr: 'Arşiv Editörü (ikincil)',
    schedule: 'weekly',
    description:
      'DEPRECATED as product path — weekly search backfill to newsArchive only. Live feed uses workers + auto-publish.',
    cronPath: '/api/cron/newsroom/archive',
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
