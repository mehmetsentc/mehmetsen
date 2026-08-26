export type ProfileVisibility = 'PUBLIC' | 'PRIVATE'
export type ActorType = 'HUMAN' | 'BOT' | 'SYSTEM'
export type CommentStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED' | 'PENDING_REVIEW'

export type SocialEventType =
  | 'publisher_followed'
  | 'publisher_unfollowed'
  | 'article_liked'
  | 'article_unliked'
  | 'article_saved'
  | 'article_unsaved'
  | 'comment_created'
  | 'article_shared'

export interface PublicUserProfile {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  city: string | null
  country: string | null
  followedPublisherCount: number
  profileVisibility: ProfileVisibility
}

export interface ArticleSocialState {
  articleId: string
  liked: boolean
  saved: boolean
  likeCount: number
  commentCount: number
}

export interface PublisherFollowState {
  publisherId: string
  following: boolean
  followerCount: number
}

export interface PaginatedResult<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}
