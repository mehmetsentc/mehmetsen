import type { NewsroomArticleInput } from '@/services/newsroom/types'
import type { ArticleChangeType } from '@/services/newsroom/detection/changeDetector'

export type QueueStatus = 'pending' | 'processing' | 'published' | 'failed' | 'dead_letter' | 'skipped'

export interface NewsQueueDocument {
  status: QueueStatus
  workerId: string
  changeType: Exclude<ArticleChangeType, 'removed' | 'unchanged'>
  input: NewsroomArticleInput
  existingNewsId?: string | null
  sourceId: string
  fingerprintHash: string
  attempts: number
  maxAttempts: number
  lastError?: string | null
  publishedNewsId?: string | null
  /** Lease owner id (process instance) while status=processing */
  leaseOwner?: string | null
  /** Epoch ms when lease expires; stale processing can be reclaimed */
  leaseExpiresAt?: number | null
  claimedAt?: number | null
  createdAt: number
  scheduledAt: number
  updatedAt: number
}

export interface QueueEnqueueInput {
  workerId: string
  changeType: Exclude<ArticleChangeType, 'removed' | 'unchanged'>
  input: NewsroomArticleInput
  sourceId: string
  fingerprintHash: string
  existingNewsId?: string | null
}

export interface QueueProcessStats {
  picked: number
  published: number
  updated: number
  drafted: number
  failed: number
  deadLetter: number
  skipped: number
  /** Cross-source duplicates blocked by newsroomStoryLibrary before AI */
  duplicateLibraryHits: number
  errors: string[]
}
