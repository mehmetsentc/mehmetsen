import { describe, expect, it } from 'vitest'
import { isYouTubeEmbedAllowed } from '@/lib/videoFeed/youtubeEmbedAllowlist'

describe('YouTube embed allowlist', () => {
  it('allows desktop Chrome/Firefox/Edge', () => {
    expect(
      isYouTubeEmbedAllowed({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      })
    ).toBe(true)
    expect(
      isYouTubeEmbedAllowed({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      })
    ).toBe(true)
  })

  it('allows Android Chrome and iOS Safari / CriOS', () => {
    expect(
      isYouTubeEmbedAllowed({
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      })
    ).toBe(true)
    expect(
      isYouTubeEmbedAllowed({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      })
    ).toBe(true)
    expect(
      isYouTubeEmbedAllowed({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
      })
    ).toBe(true)
  })

  it('blocks Capacitor, Android WebView, and bare iOS WKWebView', () => {
    expect(
      isYouTubeEmbedAllowed({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        hasCapacitor: true,
      })
    ).toBe(false)
    expect(
      isYouTubeEmbedAllowed({
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
      })
    ).toBe(false)
    expect(
      isYouTubeEmbedAllowed({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      })
    ).toBe(false)
  })
})
