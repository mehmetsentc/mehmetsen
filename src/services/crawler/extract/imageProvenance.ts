export type ImageSource = 'jsonld' | 'og' | 'twitter' | 'article_body' | 'manual'

export interface SourceImageAdapter {
  host: string | RegExp
  extraAcceptSelector?: string
  extraRejectSelector?: string
}

/** Optional host adapters. Generic extractor is the safe fallback. */
export const SOURCE_IMAGE_ADAPTERS: SourceImageAdapter[] = []

export function adapterForHost(pageUrl: string): SourceImageAdapter | null {
  let host = ''
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
  return (
    SOURCE_IMAGE_ADAPTERS.find((a) =>
      typeof a.host === 'string' ? a.host === host : a.host.test(host)
    ) || null
  )
}

export function imageSourceFromMethod(method: string): ImageSource {
  if (method === 'jsonld' || method === 'jsonld_object') return 'jsonld'
  if (method === 'og') return 'og'
  if (method === 'twitter') return 'twitter'
  if (method === 'extractor') return 'manual'
  return 'article_body'
}

export function imageConfidenceFor(input: {
  source: ImageSource
  inArticle: boolean
  inFigure: boolean
  rejected: boolean
  width: number | null
  height: number | null
}): number {
  if (input.rejected) return 0
  let score =
    input.source === 'jsonld'
      ? 0.95
      : input.source === 'og'
        ? 0.86
        : input.source === 'twitter'
          ? 0.74
          : input.source === 'manual'
            ? 0.7
            : input.inFigure
              ? 0.68
              : 0.58
  if (input.inArticle && input.source === 'article_body') score += 0.08
  if (input.width && input.width >= 800) score += 0.04
  return Math.max(0, Math.min(1, Number(score.toFixed(2))))
}

export function extraImageAllowed(source: ImageSource, inArticle: boolean): boolean {
  if (source === 'jsonld') return true
  if (source === 'article_body' && inArticle) return true
  return false
}
