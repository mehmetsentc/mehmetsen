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
  'aiEditorId',
  'summary',
  'spot',
  'description',
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

/**
 * FinOps 17 Nov (A4): `description` holds the whole article text on crawler/AI stories
 * (≈2.5 KB average, the same as `content`; measured on news_read_mirror, last 7 days) and
 * is ≈70% of every card read's bytes — Firestore egress is the largest Google line.
 * Cards only show its first 180–400 characters and fall back to `summary` (≈350 B,
 * present on all but ≈110 of 70k published stories). With NEWS_CARD_SLIM=1 list reads
 * skip `description` and read `readingTimeMinutes` instead. Off by default; one env var
 * switches it back.
 */
export function isSlimCardEnabled(): boolean {
  return process.env.NEWS_CARD_SLIM === '1'
}

export function newsCardFields(): readonly string[] {
  if (!isSlimCardEnabled()) return NEWS_CARD_FIRESTORE_FIELDS
  return [...NEWS_CARD_FIRESTORE_FIELDS.filter((f) => f !== 'description'), 'readingTimeMinutes']
}

/** No-op when the query mock has no select(), same as the feed projection guard. */
export function selectNewsCardFields<Q>(query: Selectable<Q>): Q {
  if (typeof query.select !== 'function') return query
  return query.select(...newsCardFields())
}

/**
 * FinOps (17 Nov 2026): day feed (/api/feed/more) used to read full documents (body HTML)
 * for up to 300 items per Turkey day. Card mask + the extra fields docToNewsItem /
 * slimNewsItemForFeed read. Without `content`, readingMinutes uses readingTimeMinutes or
 * the description (same as every other list surface).
 */
export const NEWS_DAY_FEED_FIRESTORE_FIELDS = [
  ...NEWS_CARD_FIRESTORE_FIELDS,
  'articleFormat',
  'readingTimeMinutes',
  'seoTitle',
  'breaking',
  'views',
  'viewsCount',
  'likesCount',
  'commentsCount',
  'commentCount',
  'sharesCount',
  'localFeaturedAt',
  'location',
  'locationCity',
  'province',
  'sourceUrl',
] as const

export function newsDayFeedFields(): readonly string[] {
  if (!isSlimCardEnabled()) return NEWS_DAY_FEED_FIRESTORE_FIELDS
  return NEWS_DAY_FEED_FIRESTORE_FIELDS.filter((f) => f !== 'description')
}

export function selectNewsDayFeedFields<Q>(query: Selectable<Q>): Q {
  if (typeof query.select !== 'function') return query
  return query.select(...newsDayFeedFields())
}
