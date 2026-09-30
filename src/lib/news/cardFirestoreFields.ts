/**
 * Firestore field mask for list/card reads.
 * Article HTML (`content`, `htmlContent`, `bodyBlocks`) stays on getNewsBySlug.
 */
export const NEWS_CARD_FIRESTORE_FIELDS = [
  'status',
  'publishedAt',
  'createdAt',
  'updatedAt',
  'slug',
  'title',
  'categoryId',
  'category',
  'originalCategoryId',
  'city',
  'citySlug',
  'cityName',
  'district',
  'districtSlug',
  'authorId',
  'author',
  'authorUsername',
  'authorDisplayName',
  'authorPhotoURL',
  'summary',
  'spot',
  'description',
  'seoDescription',
  'coverImageUrl',
  'thumbnail',
  'imageUrl',
  'featuredImage',
  'imageCaption',
  'imageAlt',
  'videoUrl',
  'hasVideo',
  'isVideo',
  'postType',
  'tags',
  'url',
  'source',
  'sourceLabel',
  'isBreaking',
  'featured',
  'featuredAt',
  'isEditorPick',
  'localFeatured',
  'visibility',
  'publicationAuthority',
  'publishedBy',
  'approvedBy',
  'aiAutoPublished',
  'needsReview',
  'needsAdminReview',
  'seoNoindex',
  'publisherType',
] as const

const BODY_FIELDS = ['content', 'contentHtml', 'htmlContent', 'body', 'bodyBlocks'] as const

export function newsCardFieldSet(): ReadonlySet<string> {
  return new Set(NEWS_CARD_FIRESTORE_FIELDS)
}

export function isArticleBodyField(field: string): boolean {
  return (BODY_FIELDS as readonly string[]).includes(field)
}

/** Drop body fields before mapping a list document. Test mocks may omit select(). */
export function pickNewsCardFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of NEWS_CARD_FIRESTORE_FIELDS) {
    if (key in data) out[key] = data[key]
  }
  return out
}

type Selectable<Q> = Q & { select?: (...fields: string[]) => Q }

/** No-op when the query mock has no select(), same as the feed projection guard. */
export function selectNewsCardFields<Q>(query: Selectable<Q>): Q {
  if (typeof query.select !== 'function') return query
  return query.select(...NEWS_CARD_FIRESTORE_FIELDS)
}
