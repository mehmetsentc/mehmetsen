import { decodeForDisplay } from '../extract/htmlEntities'
import { matchCitySlug } from './geoPrefill'
import type { CrawlerStore } from '../store/types'
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
  const extraImages = article.imageUrls.filter((u) => u && u !== article.mainImageUrl)
  return {
    title: display.title,
    content: display.articleBodyText,
    thumbnail: article.mainImageUrl || '',
    additionalImages: extraImages.map((url) => ({ url })),
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
