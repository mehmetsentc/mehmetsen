/**
 * YouTube iframe is allowed in real mobile/desktop browsers.
 * Capacitor / Android WebView / bare iOS WKWebView stay on thumbnail fallback.
 */

export function isYouTubeEmbedAllowed(input: {
  userAgent: string
  hasCapacitor?: boolean
}): boolean {
  if (input.hasCapacitor) return false
  const ua = input.userAgent || ''
  if (/Capacitor/i.test(ua)) return false
  if (/; wv\)/.test(ua)) return false

  if (/iPhone|iPad|iPod/.test(ua)) {
    if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return true
    return /Version\/\d/.test(ua) && /Safari/.test(ua)
  }

  if (/Android/.test(ua)) {
    return /Chrome|Chromium|Firefox|EdgA|SamsungBrowser/.test(ua)
  }

  if (/Chrome|Chromium|Firefox|Edg\//.test(ua) && !/Mobile/.test(ua)) return true
  return false
}

export function isRealBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const hasCapacitor = typeof window !== 'undefined' && 'Capacitor' in window
  return isYouTubeEmbedAllowed({
    userAgent: navigator.userAgent,
    hasCapacitor,
  })
}
