import { decodeForDisplay } from '../extract/htmlEntities'
import { mediaFromStoredUrls, selectEditorialHandoff } from '../extract/images'
import { matchCitySlug } from './geoPrefill'
import type { NewsSourceRecord, RawArticleRecord } from '../types'

export function rawArticleDisplay(article: RawArticleRecord) {
  return {
    title: decodeForDisplay(article.title),
    description: decodeForDisplay(article.description),
    articleBodyText: decodeForDisplay(article.articleBodyText),
    articleBodyHtml: article.articleBodyHtml,
  }
}

export function draftPrefillFromRaw(article: RawArticleRecord, source: NewsSourceRecord | null) {
  const display = rawArticleDisplay(article)
  const handoff = selectEditorialHandoff(mediaFromStoredUrls(article.mainImageUrl, article.imageUrls))
  return {
    title: display.title,
    content: display.articleBodyText,
    thumbnail: handoff.primaryUrl || '',
    additionalImages: handoff.extraUrls.map((url) => ({ url, origin: 'source' as const })),
    source: source?.name || '',
    sourceUrl: article.canonicalUrl || article.originalUrl,
    rssGuid: article.id,
    ingestionSourceId: article.sourceId,
    sourceLabel: source?.name || '',
    originalTitle: display.title,
    sourcePublishedAt: article.publishedAt?.getTime() ?? null,
    citySlug: matchCitySlug(article.city || source?.city),
    countryCode: article.countryCode,
    aiGenerated: false,
  }
}
