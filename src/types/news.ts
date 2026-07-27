/** RSS + AI ingestion fields stored on `news` / `newsDrafts` documents. */
export type NewsIngestStatus = 'pending' | 'published' | 'draft' | 'archived' | 'banned'

/** Draft queue status — AI-ingested items await admin review before publish. */
export type NewsDraftStatus = 'pending_review' | 'rejected' | 'approved'

export interface NewsIngestMeta {
  /** Stable hash of source + guid/link for deduplication */
  rssFingerprint: string
  /** Original RSS item guid or link */
  rssGuid: string
  /** Canonical URL of the source article */
  sourceUrl: string
  /** RSS provider id (aa, bbc, …) */
  ingestionSourceId: string
  /** Human-readable source label shown to users */
  sourceLabel: string
  /** True when body was rewritten by OpenAI */
  aiGenerated: boolean
  /** Original headline from RSS (audit trail) */
  originalTitle?: string
  /** When the article was first ingested (epoch ms) */
  ingestedAt: number
  /** When source RSS item was published, if known (epoch ms) */
  sourcePublishedAt?: number | null
}

export interface NewsLocationFields {
  city: string
  district: string
  citySlug: string
  country: string
  location: { city: string; district?: string; country: string; lat: number; lng: number } | null
}

export type NewsroomEditorType = 'local' | 'national' | 'breaking' | 'trend' | 'influencer' | 'event'

/** AI Newsroom fields on drafts and published news. */
export interface NewsroomFields {
  editorId?: string
  editorType?: NewsroomEditorType
  /** Persistent AI persona (V2) — distinct from worker editorId */
  aiEditorId?: string
  articleFormat?: 'standard' | 'column' | 'analysis'
  /** 0–100 fact-checker confidence */
  confidenceScore?: number
  factCheckFlags?: string[]
  isBreaking?: boolean
  /** 1–100 breaking urgency for feed pin */
  priorityScore?: number
  /** 0–100 composite breaking score */
  breakingScore?: number
  isPinned?: boolean
  isTrending?: boolean
  canonicalId?: string
  duplicateOf?: string
  needsAdminReview?: boolean
}

export interface NewsDraftDocument extends NewsIngestMeta, NewsLocationFields, NewsroomFields {
  title: string
  summary?: string
  description: string
  author: string
  authorId: string
  authorUsername?: string
  authorDisplayName?: string
  authorPhotoURL?: string | null
  thumbnail: string
  videoUrl: string
  category: string
  categoryId: string
  tags: string[]
  type: 'news'
  source: string
  draftStatus: NewsDraftStatus
  moderationReasons?: string[]
  createdAt: number
  updatedAt: number
}

export interface PendingNewsDocument extends NewsIngestMeta, NewsLocationFields, NewsroomFields {
  slug?: string
  title: string
  summary?: string
  description: string
  author: string
  authorId: string
  thumbnail: string
  videoUrl: string
  category: string
  categoryId: string
  tags: string[]
  type: 'news'
  source: string
  status: NewsIngestStatus
  createdAt: number
  publishedAt: number | null
  updatedAt: number
  viewsCount: number
  likesCount: number
  commentCount: number
  savesCount: number
  sharesCount: number
}

/** Historical archive — AI-rewritten RSS backfill (not auto-published to feed). */
export interface NewsArchiveDocument {
  title: string
  /** Short AI summary (1–2 sentences). */
  summary: string
  /** Full AI-rewritten body. */
  content: string
  categoryId: string
  city: string
  district: string
  citySlug: string
  country: string
  source: string
  sourceUrl: string
  /** RSS fingerprint (sha256 of sourceId:guid). */
  fingerprint: string
  /** Hash of normalized sourceUrl for URL-level dedupe. */
  sourceHash: string
  /** Original RSS publish time (epoch ms). */
  publishedAt: number | null
  /** When archived into newsArchive (epoch ms). */
  archivedAt: number
  tags: string[]
  /** 0–100 fact-checker confidence. */
  confidenceScore: number
  factCheckFlags?: string[]
  editorId: 'archive'
  status: 'archived'
  aiGenerated: boolean
  originalTitle: string
  sourceLabel: string
  ingestionSourceId: string
  rssGuid: string
  thumbnail?: string
  createdAt: number
  updatedAt: number
}

export interface ArchiveRunResult {
  editorId: 'archive'
  days: number
  sourcesChecked: number
  itemsFetched: number
  itemsArchived: number
  itemsSkipped: number
  itemsFailed: number
  lowConfidence: number
  errors: string[]
  durationMs: number
}

export interface NewsSyncResult {
  sourcesChecked: number
  itemsFetched: number
  itemsNew: number
  itemsSkipped: number
  itemsFailed: number
  /** @deprecated Use draftsCreated — kept for cron JSON compat */
  pendingCreated: number
  draftsCreated: number
  autoPublished: number
  errors: string[]
  durationMs: number
  /** Present on batch ingest runs */
  batch?: {
    categories: string[]
    days: number
    perCategory: Record<string, { fetched: number; created: number; skipped: number; failed: number }>
  }
}
