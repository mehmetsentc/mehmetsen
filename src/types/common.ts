// TODO: Implement in Phase 1
export interface PaginationCursor {
  lastDoc: unknown | null
  hasMore: boolean
}

export interface PaginatedResult<T> {
  items: T[]
  cursor: PaginationCursor
}

export interface ApiError {
  code: string
  message: string
}

export type ReportTargetType = 'post' | 'comment' | 'user'
export type ReportReason = 'spam' | 'hate_speech' | 'misinformation' | 'violence' | 'other'
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed'

export interface Report {
  id: string
  reporterId: string
  targetId: string
  targetType: ReportTargetType
  reason: ReportReason
  description: string
  status: ReportStatus
  reviewedBy: string | null
  reviewedAt: string | null
  action: string | null
  createdAt: string
}

export interface Category {
  id: string
  name: string
  slug: string
  description: string
  iconName: string
  color: string
  order: number
  isActive: boolean
  postsCount: number
  createdAt: string
}
