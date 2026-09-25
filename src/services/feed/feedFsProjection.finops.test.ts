import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FEED_FS_FIELDS } from './FeedCandidateService'

/**
 * Fields read from a Firestore news doc by the Smart Feed candidate path.
 * publicReadMetaFromFirestoreDoc + mapFirestoreDocToRow + acceptDoc gates.
 * Body fields must stay off this list (egress).
 */
const REQUIRED_FEED_FS_FIELDS = [
  'status',
  'publishedAt',
  'createdAt',
  'updatedAt',
  'slug',
  'title',
  'categoryId',
  'category',
  'clusterId',
  'citySlug',
  'districtSlug',
  'tags',
  'isBreaking',
  'breaking',
  'editorType',
  'isFeatured',
  'featured',
  'isEditorPick',
  'editorPick',
  'materialUpdate',
  'visibility',
  'publicationAuthority',
  'publishedBy',
  'approvedBy',
  'authorId',
  'aiAutoPublished',
  'needsReview',
  'needsAdminReview',
  'seoNoindex',
  'publisherType',
  'sourceSlug',
  'publisherSlug',
  'sourceId',
  'ingestionSourceId',
  'sourceLabel',
  'source',
  'authorDisplayName',
  'aiEditorId',
  'sourceLogoUrl',
  'publisherVerified',
  'verified',
  'smartFeedSummary',
  'summary',
  'spot',
  'description',
  'teaser',
  'coverImageUrl',
  'thumbnail',
  'imageUrl',
  'videoUrl',
  'clusterSourceCount',
  'clusterImportance',
  'sourceQualityTier',
  'sourceHealthScore',
  'likesCount',
  'commentsCount',
  'commentCount',
  'savesCount',
  'sharesCount',
  'viewsCount',
  'readDurationMs',
] as const

describe('FINOPS feed Firestore projection', () => {
  it('includes every field the candidate mapper and public-read classifier read', () => {
    const projected = new Set<string>(FEED_FS_FIELDS)
    const missing = REQUIRED_FEED_FS_FIELDS.filter((field) => !projected.has(field))
    expect(missing).toEqual([])
  })

  it('does not project article body fields', () => {
    const projected = new Set<string>(FEED_FS_FIELDS)
    expect(projected.has('content')).toBe(false)
    expect(projected.has('html')).toBe(false)
    expect(projected.has('body')).toBe(false)
    expect(projected.has('articleBody')).toBe(false)
    expect(projected.has('contentHtml')).toBe(false)
  })

  it('keeps the projection kill switch in the service source', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/services/feed/FeedCandidateService.ts'), 'utf8')
    expect(src).toContain("process.env.FEED_FS_PROJECTION?.trim() !== '0'")
    expect(src).toContain('fieldMask')
  })
})
