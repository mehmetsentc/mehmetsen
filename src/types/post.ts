import type { PostLocation } from '@/lib/location'

// 'pending' = held for moderation/admin approval (AI flagged or uncertain).
// Like 'draft', pending posts MUST be excluded from all public feeds.
export type PostStatus = 'draft' | 'pending' | 'published' | 'archived' | 'banned'
export type PostVisibility = 'public' | 'followers' | 'private'
export type MediaType = 'image' | 'video'
export type PostType = 'news' | 'video' | 'photo' | 'user_post'

export interface MediaItem {
  type: MediaType
  url: string
  thumbnailUrl: string | null
  caption: string | null
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
  priorityScore?: number
  editorType?: string
  confidenceScore?: number
  publishedAt: string | null
  createdAt: string
  updatedAt: string
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
