/** AI Newsroom — shared types for the multi-editor autonomous pipeline. */

export type EditorId =
  | 'local-news'
  | 'national-news'
  | 'breaking-news'
  | 'world-news'
  | 'tech-news'
  | 'sports-news'
  | 'health-news'
  | 'politics-news'
  | 'magazine-news'
  | 'trend'
  | 'influencer'
  | 'event'
  | 'fact-checker'
  | 'category-engine'
  | 'geo-engine'
  | 'archive'
  | 'afad-deprem'
  | 'finans'
  | 'kripto'
  | 'video-queue'
  | 'video-process'
  | 'entertainment'
  | 'seo-maintenance'
  | 'weather'
  | 'recategorize'
  | 'gastronomi-news'
  | 'otomobil-news'

export type EditorSchedule = '1m' | '2m' | '5m' | '10m' | '15m' | '30m' | '1h' | '6h' | 'weekly' | 'daily' | 'pipeline'

export interface EditorMetadata {
  id: EditorId
  name: string
  nameTr: string
  schedule: EditorSchedule
  description: string
  /** Cron path when scheduled (pipeline editors omit). */
  cronPath?: string
}

export type NewsroomEditorType = 'local' | 'national' | 'breaking' | 'trend' | 'influencer' | 'event'

/** Raw article payload produced by an editor before pipeline enrichment. */
export interface NewsroomArticleInput {
  editorId: EditorId
  editorType: NewsroomEditorType
  sourceLabel: string
  sourceUrl: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  imageUrl?: string
  rssFingerprint?: string
  rssGuid?: string
  ingestionSourceId?: string
  sourcePublishedAt?: number | null
  /** Editor-specific overrides applied after AI rewrite. */
  forcedCategoryId?: string
  /** Skip geo inference — pin to province slug from local worker. */
  forcedCity?: string
  forcedCitySlug?: string
  forcedDistrict?: string
  extraTags?: string[]
  isBreaking?: boolean
  priorityScore?: number
  /** Full article HTML extracted from source page */
  htmlContent?: string
  /** Estimated reading time in minutes */
  readingTimeMinutes?: number
  /** Author extracted from article page */
  extractedAuthor?: string
  /**
   * When true, skip the AI rewrite step — content is already AI-generated
   * (e.g. trend editor, influencer editor). Preserves originalTitle/Summary/Content as-is.
   */
  skipAiRewrite?: boolean
}

/** Enriched article after fact-check, category, and geo engines. */
export interface NewsroomArticle extends NewsroomArticleInput {
  title: string
  description: string
  categoryId: string
  city: string | null
  district: string | null
  country: string
  tags: string[]
  /** 0–100 — fact-checker confidence; low values flagged for admin. */
  confidenceScore: number
  /** 1–100 — breaking urgency for feed pin. */
  priorityScore: number
  /** 0–100 composite breaking score (AI + heuristics). */
  breakingScore?: number
  isPinned?: boolean
  isBreaking: boolean
  factCheckFlags: string[]
  moderationReasons: string[]
  aiGenerated: boolean
}

export interface NewsroomRunResult {
  editorId: EditorId
  sourcesChecked: number
  itemsFetched: number
  itemsNew: number
  itemsSkipped: number
  itemsFailed: number
  draftsCreated: number
  autoPublished: number
  lowConfidence: number
  errors: string[]
  durationMs: number
}

export function emptyNewsroomResult(editorId: EditorId): NewsroomRunResult {
  return {
    editorId,
    sourcesChecked: 0,
    itemsFetched: 0,
    itemsNew: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
    draftsCreated: 0,
    autoPublished: 0,
    lowConfidence: 0,
    errors: [],
    durationMs: 0,
  }
}
