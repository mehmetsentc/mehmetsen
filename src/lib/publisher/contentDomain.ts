/** Domain helpers for Publisher Content Studio (P7). */

import type { ArticleBlock } from '@/lib/articleBlocks'
import { sanitizeArticleBlocks, articleBlocksToPlainText } from '@/lib/articleBlocks'
import { buildNewsSlug, slugifyNewsTitle } from '@/lib/newsSlug'
import type {
  PublisherContentDraftInput,
  PublisherContentItem,
  PublisherContentStatus,
} from '@/types/publisherContent'
import type { PublisherMemberRole } from '@/types/publisher'

export function canRoleCreateContent(role: PublisherMemberRole): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR' || role === 'AUTHOR'
}

export function canRoleReviewContent(role: PublisherMemberRole): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR'
}

export function canRolePublishContent(role: PublisherMemberRole): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR'
}

export function canRoleEditOthersDrafts(role: PublisherMemberRole): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR'
}

export function canRoleSetBreaking(role: PublisherMemberRole): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR'
}

export function canUserEditContent(
  role: PublisherMemberRole,
  item: Pick<PublisherContentItem, 'createdBy' | 'status'>,
  userId: string
): boolean {
  if (item.status === 'PUBLISHED' || item.status === 'ARCHIVED') return false
  if (canRoleEditOthersDrafts(role)) return true
  if (role === 'AUTHOR' && item.createdBy === userId) {
    return item.status === 'DRAFT' || item.status === 'CHANGES_REQUESTED'
  }
  return false
}

export function normalizeContentBlocks(raw: unknown): ArticleBlock[] {
  return sanitizeArticleBlocks(raw)
}

export function contentBodyPlainText(item: Pick<PublisherContentItem, 'bodyBlocks' | 'bodyHtml' | 'summary'>): string {
  const fromBlocks = articleBlocksToPlainText(item.bodyBlocks ?? [])
  if (fromBlocks.trim()) return fromBlocks
  if (item.bodyHtml?.trim()) return item.bodyHtml.replace(/<[^>]+>/g, ' ').trim()
  return item.summary?.trim() ?? ''
}

export function resolveStablePublishSlug(
  item: Pick<PublisherContentItem, 'seoSlug' | 'title' | 'publishedNewsId'>,
  newsId: string
): string {
  const existing = item.seoSlug?.trim()
  if (existing && !existing.startsWith('taslak')) return existing
  const suffix = newsId.replace(/[^a-z0-9]/gi, '').slice(0, 8) || newsId.slice(0, 8)
  return buildNewsSlug(item.title || 'haber', suffix)
}

export function draftSlugCandidate(title: string): string {
  return slugifyNewsTitle(title || 'taslak')
}

export function applyDraftPatch(
  current: PublisherContentItem,
  patch: PublisherContentDraftInput
): Partial<PublisherContentItem> {
  const next: Partial<PublisherContentItem> = {}
  if (patch.title !== undefined) next.title = patch.title.trim()
  if (patch.spot !== undefined) next.spot = patch.spot?.trim() || null
  if (patch.summary !== undefined) next.summary = patch.summary?.trim() || null
  if (patch.bodyBlocks !== undefined) next.bodyBlocks = normalizeContentBlocks(patch.bodyBlocks)
  if (patch.bodyHtml !== undefined) next.bodyHtml = patch.bodyHtml
  if (patch.categoryId !== undefined) next.categoryId = patch.categoryId?.trim() || null
  if (patch.citySlug !== undefined) next.citySlug = patch.citySlug?.trim() || null
  if (patch.districtSlug !== undefined) next.districtSlug = patch.districtSlug?.trim() || null
  if (patch.cityName !== undefined) next.cityName = patch.cityName?.trim() || null
  if (patch.districtName !== undefined) next.districtName = patch.districtName?.trim() || null
  if (patch.heroImageUrl !== undefined) next.heroImageUrl = patch.heroImageUrl?.trim() || null
  if (patch.videoUrl !== undefined) next.videoUrl = patch.videoUrl?.trim() || null
  if (patch.tags !== undefined) {
    next.tags = [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 40)
  }
  if (patch.seoTitle !== undefined) next.seoTitle = patch.seoTitle?.trim() || null
  if (patch.seoDescription !== undefined) next.seoDescription = patch.seoDescription?.trim() || null
  if (patch.seoSlug !== undefined) {
    const s = patch.seoSlug?.trim()
    next.seoSlug = s ? slugifyNewsTitle(s) : null
  }
  if (patch.rightsStatus !== undefined) next.rightsStatus = patch.rightsStatus
  if (patch.rightsBasis !== undefined) next.rightsBasis = patch.rightsBasis
  if (patch.sourceUrl !== undefined) next.sourceUrl = patch.sourceUrl?.trim() || null
  return next
}

export function snapshotContent(item: PublisherContentItem): Record<string, unknown> {
  return {
    status: item.status,
    title: item.title,
    spot: item.spot,
    summary: item.summary,
    bodyBlocks: item.bodyBlocks,
    categoryId: item.categoryId,
    citySlug: item.citySlug,
    districtSlug: item.districtSlug,
    heroImageUrl: item.heroImageUrl,
    videoUrl: item.videoUrl,
    tags: item.tags,
    seoTitle: item.seoTitle,
    seoDescription: item.seoDescription,
    seoSlug: item.seoSlug,
    isBreaking: item.isBreaking,
    version: item.version,
  }
}

export function isTerminalStatus(status: PublisherContentStatus): boolean {
  return status === 'PUBLISHED' || status === 'ARCHIVED'
}
