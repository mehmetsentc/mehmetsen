// TODO: Implement in Phase 1
export type PostStatus = 'draft' | 'published' | 'archived' | 'banned'
export type PostVisibility = 'public' | 'followers' | 'private'
export type MediaType = 'image' | 'video'

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
  summary: string
  authorId: string
  authorUsername: string
  categoryId: string
  tags: string[]
  mediaItems: MediaItem[]
  coverImageUrl: string | null
  status: PostStatus
  visibility: PostVisibility
  likesCount: number
  commentsCount: number
  savesCount: number
  viewsCount: number
  isEditorPick: boolean
  isTrending: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
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
