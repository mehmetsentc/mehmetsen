/** Shared Feed Reader DTO — safe for client + server imports. */

export type FeedReaderArticleDto = {
  id: string
  slug: string
  headline: string
  summary: string | null
  category: string | null
  publishedAt: string | null
  image: string | null
  imageCaption: string | null
  readingTimeMinutes: number | null
  video: string | null
  publisher: {
    id: string | null
    slug: string | null
    name: string | null
    logoUrl: string | null
  } | null
  source: string | null
  sourceUrl: string | null
  bodyHtml: string | null
  bodyText: string | null
  tags: string[]
  canonicalPath: string
}
