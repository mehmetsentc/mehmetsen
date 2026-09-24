/**
 * SEO-1A-X.1 — `htmlLimitedBots` in next.config.ts.
 *
 * Uses Next.js's own decision function (`shouldServeStreamingMetadata`) with the
 * config exactly as Next's config loader passes it (RegExp → `.source`, then
 * `new RegExp(source, 'i')`). The Next internals are imported in this test only,
 * never at runtime in next.config.ts.
 */
import { describe, expect, it } from 'vitest'
import nextConfig from '../../../next.config'
import { HTML_LIMITED_BOT_UA_RE } from 'next/dist/shared/lib/router/utils/html-bots'
import { shouldServeStreamingMetadata } from 'next/dist/server/lib/streaming-metadata'

const custom = nextConfig.htmlLimitedBots as RegExp
// next/dist/server/config.js: `userConfig.htmlLimitedBots = userConfig.htmlLimitedBots.source`
const configured = custom.source

/** true → blocking metadata in <head>; false → streamed into <body>. */
const blocking = (ua: string) => !shouldServeStreamingMetadata(ua, configured)
const blockingDefault = (ua: string) => !shouldServeStreamingMetadata(ua, undefined)

const UA = {
  googlebotSmartphone:
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.116 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  googlebotDesktop:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/130.0.6723.116 Safari/537.36',
  googlebotLegacy: 'Googlebot/2.1 (+http://www.google.com/bot.html)',
  inspectionTool:
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)',
  bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  twitter: 'Twitterbot/1.0',
  chromeDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  nahaberIosWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
}

describe('SEO-1A-X.1 htmlLimitedBots — default coverage preserved', () => {
  it('is exactly Next.js default list + real Googlebot (fails loudly if Next changes its default)', () => {
    expect(custom).toBeInstanceOf(RegExp)
    expect(custom.flags).toBe('')
    expect(configured).toBe(`${HTML_LIMITED_BOT_UA_RE.source}|Googlebot(?!-)`)
  })

  // One representative UA per alternative in Next's default list.
  const defaultBots = [
    'Mediapartners-Google',
    'AdsBot-Google (+http://www.google.com/adsbot.html)',
    'Storebot-Google/1.0',
    'Google-InspectionTool/1.0',
    'Google-PageRenderer',
    'Chrome-Lighthouse',
    'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
    'DuckDuckBot/1.1',
    'Baiduspider/2.0; baiduspider',
    'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    'Sogou web spider/4.0',
    'bitlybot/3.0',
    'Tumblr/14.0.835.186',
    'vkShare; +http://vk.com/dev/Share',
    'quora link preview',
    'redditbot/1.0',
    'ia_archiver',
    UA.bingbot,
    'BingPreview/1.0b',
    'Applebot/0.1',
    UA.facebook,
    'facebookcatalog/1.0',
    UA.twitter,
    'LinkedInBot/1.0',
    'Slackbot-LinkExpanding 1.0',
    'Discordbot/2.0',
    'WhatsApp/2.23.20.0',
    'SkypeUriPreview Preview/0.5',
    'Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)',
    'googleweblight',
  ]

  it.each(defaultBots)('default HTML-limited bot keeps blocking metadata: %s', (ua) => {
    expect(blockingDefault(ua)).toBe(true) // sanity: Next default says blocking
    expect(blocking(ua)).toBe(true) // still blocking with our config
  })
})

describe('SEO-1A-X.1 test matrix', () => {
  it('Googlebot Smartphone → blocking metadata (<head>) — was streaming before', () => {
    expect(blockingDefault(UA.googlebotSmartphone)).toBe(false)
    expect(blocking(UA.googlebotSmartphone)).toBe(true)
  })

  it('Googlebot Desktop → blocking metadata (<head>) — was streaming before', () => {
    expect(blockingDefault(UA.googlebotDesktop)).toBe(false)
    expect(blocking(UA.googlebotDesktop)).toBe(true)
    expect(blocking(UA.googlebotLegacy)).toBe(true)
  })

  it('Google-InspectionTool → still <head>', () => {
    expect(blocking(UA.inspectionTool)).toBe(true)
  })

  it.each([
    ['Bingbot', UA.bingbot],
    ['facebookexternalhit', UA.facebook],
    ['Twitterbot', UA.twitter],
  ])('%s → still <head>', (_name, ua) => {
    expect(blocking(ua)).toBe(true)
  })

  it.each(Object.entries(UA).filter(([k]) => /chrome|safari|firefox|WebView/i.test(k)))(
    'normal user %s → streaming metadata unchanged',
    (_name, ua) => {
      expect(blockingDefault(ua)).toBe(false)
      expect(blocking(ua)).toBe(false)
    }
  )

  it('does not widen to other Googlebot-* product tokens', () => {
    for (const ua of ['Googlebot-Image/1.0', 'Googlebot-Video/1.0', 'Googlebot-News']) {
      expect(blockingDefault(ua)).toBe(false)
      expect(blocking(ua)).toBe(false)
    }
  })
})
