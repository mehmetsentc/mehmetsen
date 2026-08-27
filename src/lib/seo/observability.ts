/**
 * Phase P6 SEO observability — structured logs, no PII.
 */
export type SeoObservabilityEvent =
  | 'seo_indexable_article'
  | 'seo_indexable_publisher'
  | 'seo_indexable_city'
  | 'seo_indexable_district'
  | 'seo_indexable_category'
  | 'seo_indexable_topic'
  | 'seo_indexable_event'
  | 'seo_noindex'
  | 'sitemap_urls_generated'
  | 'sitemap_generation_error'

export function seoLog(event: SeoObservabilityEvent, meta?: Record<string, unknown>): void {
  console.info(`[seo] ${event}`, meta ?? {})
}

export function recordSeoIndexable(pageType: string, indexable: boolean, reason?: string): void {
  const event = indexable ? (`seo_indexable_${pageType}` as SeoObservabilityEvent) : 'seo_noindex'
  seoLog(event, { pageType, indexable, reason: reason ?? null })
}

export function recordSitemapGeneration(sitemapType: string, urlCount: number): void {
  seoLog('sitemap_urls_generated', { sitemapType, urlCount })
}

export function recordSitemapError(sitemapType: string, message: string): void {
  seoLog('sitemap_generation_error', { sitemapType, message })
}
