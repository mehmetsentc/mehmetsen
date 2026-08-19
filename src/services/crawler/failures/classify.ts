export type CrawlerFailureClass =
  | 'discovery'
  | 'robots_policy'
  | 'http_error'
  | 'http_403'
  | 'http_404'
  | 'http_429'
  | 'timeout'
  | 'extraction'
  | 'low_confidence'
  | 'image_extraction'
  | 'other'

export function classifyCrawlerFailure(input: {
  failureReason?: string | null
  status?: string | null
  httpStatus?: number | null
  qualityStatus?: string | null
}): CrawlerFailureClass {
  const reason = (input.failureReason || '').toLowerCase()
  const status = (input.status || '').toLowerCase()
  const http = input.httpStatus
  if (input.qualityStatus === 'LOW_CONFIDENCE' || reason.includes('low_confidence')) return 'low_confidence'
  if (reason.includes('image')) return 'image_extraction'
  if (reason.includes('robots') || reason.includes('policy')) return 'robots_policy'
  if (http === 403 || reason.includes('403')) return 'http_403'
  if (http === 404 || http === 410 || status.includes('404') || reason.includes('404')) return 'http_404'
  if (http === 429 || reason.includes('429')) return 'http_429'
  if (reason.includes('timeout') || reason.includes('abort') || reason.includes('timed')) return 'timeout'
  if (input.qualityStatus === 'FAILED' || reason.includes('extract') || reason.includes('thin_extraction')) {
    return 'extraction'
  }
  if (reason.includes('discover') || status === 'degraded') return 'discovery'
  if (http && http >= 400) return 'http_error'
  if (reason) return 'http_error'
  return 'other'
}

export const FAILURE_CLASS_LABELS: Record<CrawlerFailureClass, string> = {
  discovery: 'Kaynak keşif hatası',
  robots_policy: 'Robots / politika',
  http_error: 'HTTP hatası',
  http_403: '403 yasak',
  http_404: '404 bulunamadı',
  http_429: '429 çok fazla istek',
  timeout: 'Zaman aşımı',
  extraction: 'Metin çıkarma hatası',
  low_confidence: 'Düşük güvenli çıkarım',
  image_extraction: 'Görsel çıkarma hatası',
  other: 'Diğer',
}
