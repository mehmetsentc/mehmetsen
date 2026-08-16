import type { PostLocation } from '@/lib/location'
import type { ArticleBlock } from '@/lib/articleBlocks'

// 'pending' = held for moderation/admin approval (AI flagged or uncertain).
// Like 'draft', pending posts MUST be excluded from all public feeds.
export type PostStatus = 'draft' | 'pending' | 'published' | 'archived' | 'banned'
export type PostVisibility = 'public' | 'followers' | 'private'
export type MediaType = 'image' | 'video'
export type PostType = 'news' | 'video' | 'photo' | 'user_post'

export interface InfographicStat {
  label: string
  value: string
  unit?: string
}

export interface PostInfographic {
  title?: string
  stats: InfographicStat[]
  source?: string
}

export interface MediaItem {
  type: MediaType
  url: string
  thumbnailUrl: string | null
  caption: string | null
  /**
   * Optional alt text for accessibility / SEO. Falls back to `caption` then
   * to the article title when rendered.
   */
  alt?: string | null
  /**
   * Stable identifier for drag-reorder + dedup. Generated client-side when
   * absent (e.g. URL hash).
   */
  id?: string
  /**
   * Stable ordering hint. Lower values render first. When two items share
   * the same value, the array order wins.
   */
  order?: number
  /**
   * Optional credit line (e.g. photographer / agency).
   */
  credit?: string | null
}

export interface Post {
  id: string
  title: string
  slug: string
  content: string
  /** Stored AI/RSS summary (may be longer than feed display). */
  summary: string
  /** Short unique teaser for feed cards — derived from title + summary. */
  feedTeaser?: string
  authorId: string
  authorUsername: string
  authorDisplayName: string
  authorPhotoURL: string | null
  categoryId: string
  city?: string | null
  citySlug?: string | null
  /** İlçe display name (geo / CMS). */
  district?: string | null
  districtSlug?: string | null
  location?: PostLocation | null
  tags: string[]
  mediaItems: MediaItem[]
  coverImageUrl: string | null
  status: PostStatus
  visibility: PostVisibility
  postType: PostType
  source: string
  likesCount: number
  commentsCount: number
  savesCount: number
  sharesCount: number
  viewsCount: number
  isEditorPick: boolean
  isTrending: boolean
  /** Breaking news pin — sorted by priorityScore in feed. */
  isBreaking?: boolean
  /** Category before CMS parked the story in son-dakika. */
  originalCategoryId?: string
  /**
   * Editorial “Genelde öne çıkan” — national homepage featured slider
   * (FeaturedSlider), independent of gundem / son-dakika.
   */
  featured?: boolean
  /**
   * Editorial “Yerelde öne çıkan” — only that city's yerel page carousel.
   * Requires citySlug. Independent of `featured`.
   */
  localFeatured?: boolean
  localFeaturedAt?: string
  priorityScore?: number
  editorType?: string
  confidenceScore?: number
  /** Full HTML article content from page extraction */
  htmlContent?: string
  /** Ordered long-form body blocks authored in the CMS. */
  bodyBlocks?: ArticleBlock[]
  /** Optional presentation style; longform uses wider editorial spacing. */
  articleLayout?: 'standard' | 'longform'
  /** News vs opinion column (V2) */
  articleFormat?: 'standard' | 'column' | 'analysis'
  /** Persistent AI editor persona */
  aiEditorId?: string
  authorIsAI?: boolean
  /** Estimated reading time in minutes */
  readingTimeMinutes?: number
  /** Original source article URL */
  sourceUrl?: string
  /**
   * Journalistic lead paragraph — answers Who/What/Where/When/Why/How.
   * 2-4 sentences, 60-120 words. Displayed prominently on article page.
   */
  spot?: string
  /** SEO-optimized title for search engines (55-65 chars) */
  seoTitle?: string
  /** SEO meta description for SERP snippet (145-165 chars) */
  seoDescription?: string
  /** SEO keywords for meta keywords tag */
  seoKeywords?: string[]
  /** AI-generated 60s video voiceover script (first 500 chars) */
  videoScript?: string
  /** Full JSON-serialized VideoScript object */
  videoScriptFull?: string
  /** Short video title generated for TikTok/Reels feed */
  videoTitle?: string
  /** ID of the generated video document in videos collection */
  videoId?: string
  /** True when article has been added to videoQueue */
  videoQueued?: boolean
  /** 30-second voice script for TikTok Shorts */
  videoScript30s?: string
  /** 90-second voice script for YouTube Shorts / longer Reels */
  videoScript90s?: string
  /** Twitter/X caption ≤280 chars with hashtags */
  twitterCaption?: string
  /** Instagram caption with hashtags */
  instagramCaption?: string
  /** WhatsApp shareable plain text */
  whatsappCaption?: string
  /** Public URL for AI-generated TTS audio (MP3) stored in Firebase Storage */
  audioUrl?: string
  /** Firebase Storage path for the TTS MP3 */
  audioStoragePath?: string
  /** True when TTS audio has been generated successfully */
  audioReady?: boolean
  /** Optional data-story infographic block for article pages */
  infographic?: PostInfographic
  /** Live blog mode — renders timeline of updates at /canli/[slug] */
  isLiveBlog?: boolean
  /** Chronological live blog updates (newest first in storage, rendered oldest-first) */
  liveUpdates?: LiveBlogUpdate[]
  /**
   * Additional inline images placed between article paragraphs.
   * Stored in order; rendered evenly distributed across paragraphs.
   */
  additionalImages?: Array<{ url: string; caption?: string }>
  /** Kapak görseli SEO açıklaması (image sitemap + alt text) */
  imageCaption?: string | null
  /** AI editör tekrar haber tespiti */
  isDuplicate?: boolean
  duplicateReason?: string
  /** AI auto-published; CMS İnceleme kuyruğu */
  aiAutoPublished?: boolean
  needsReview?: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LiveBlogUpdate {
  id: string
  content: string
  timestamp: string
  author?: string
}

export interface TimelinePost extends Post {
  isFromFollowing?: boolean
}

export interface PostWithAuthor extends Post {
  author: {
    displayName: string
    photoURL: string | null
    isVerified: boolean
  }
  isLiked?: boolean
  isSaved?: boolean
}
