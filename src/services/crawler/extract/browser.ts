import { isNewsCrawlerBrowserEnabled } from '../enabled'
import { logCrawler } from '../log'

const BLOCKED_TYPES = new Set(['font', 'media', 'websocket', 'manifest'])
const BLOCKED_URL =
  /google-analytics|googletagmanager|doubleclick|facebook\.net|adsystem|adservice|hotjar|segment\.io|scorecardresearch|chartbeat|outbrain|taboola|criteo/i

/**
 * HTTP is the default. Playwright runs only when the browser flag is on
 * and extraction was insufficient. Chromium is reused via a module-level browser.
 */
let browserPromise: Promise<{ newPage: () => Promise<PlaywrightPage>; close?: () => Promise<void> } | null> | null =
  null

type PlaywrightPage = {
  route: (pattern: string, handler: (route: { request: () => { resourceType: () => string; url: () => string }; abort: () => Promise<void>; continue: () => Promise<void> }) => unknown) => Promise<void>
  goto: (url: string, opts?: object) => Promise<unknown>
  content: () => Promise<string>
  close: () => Promise<void>
}

async function getBrowser() {
  if (!isNewsCrawlerBrowserEnabled()) return null
  if (!browserPromise) {
    browserPromise = (async () => {
      const loaded = (await new Function('return import("playwright")')()) as {
        chromium: { launch: (opts?: object) => Promise<{ newPage: () => Promise<PlaywrightPage> }> }
      }
      return loaded.chromium.launch({
        headless: true,
        args: ['--disable-dev-shm-usage', '--no-sandbox'],
      })
    })().catch(() => {
      browserPromise = null
      return null
    })
  }
  return browserPromise
}

export async function fetchRenderedHtml(opts: {
  url: string
  sourceId?: string
}): Promise<{ html: string; usedBrowser: boolean }> {
  if (!isNewsCrawlerBrowserEnabled()) {
    logCrawler({
      sourceId: opts.sourceId,
      url: opts.url,
      stage: 'browser',
      errorCode: 'BROWSER_DISABLED',
    })
    return { html: '', usedBrowser: false }
  }

  try {
    const browser = await getBrowser()
    if (!browser) {
      logCrawler({
        sourceId: opts.sourceId,
        url: opts.url,
        stage: 'browser',
        errorCode: 'BROWSER_UNAVAILABLE',
      })
      return { html: '', usedBrowser: false }
    }
    const page = await browser.newPage()
    try {
      await page.route('**/*', (route) => {
        const type = route.request().resourceType()
        const url = route.request().url()
        if (BLOCKED_TYPES.has(type) || BLOCKED_URL.test(url)) {
          return route.abort()
        }
        return route.continue()
      })
      await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      const html = await page.content()
      return { html, usedBrowser: true }
    } finally {
      await page.close()
    }
  } catch (err) {
    logCrawler({
      sourceId: opts.sourceId,
      url: opts.url,
      stage: 'browser',
      errorCode: err instanceof Error ? err.message.slice(0, 80) : 'BROWSER_FAILED',
    })
    return { html: '', usedBrowser: false }
  }
}
