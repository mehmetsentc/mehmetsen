import { decodeForDisplay } from '../extract/htmlEntities'
import { mediaFromStoredUrls, selectEditorialHandoff } from '../extract/images'
import { matchCitySlug } from './geoPrefill'
import type { NewsSourceRecord, RawArticleRecord } from '../types'
import { isSondakikaCitySource } from '../sondakika/registry'
import { isTourismSource } from '../tourism/registry'

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
    // SONDAKIKA-81: il sayfası kaynağının ili haberin ili değildir.
    citySlug: matchCitySlug(article.city || (isSondakikaCitySource(source) ? null : source?.city)),
    // TOURISM-SRC-1: turizm kaynağından elle taslak → kategori ön seçimi.
    ...(isTourismSource(source) ? { categoryId: 'turizm' } : {}),
    countryCode: article.countryCode,
    aiGenerated: false,
  }
}
