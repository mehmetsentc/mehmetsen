import { getSiteUrl } from '@/lib/seo'

/** IndexNow key — must match public/{key}.txt on the production host. */
export function getIndexNowKey(): string {
  return process.env.INDEXNOW_KEY?.trim() || 'nahaber2026index'
}

const INDEXNOW_ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://yandex.com/indexnow',
] as const

/** Notify Bing/Yandex/Naver etc. that URLs were added or updated. */
export async function submitIndexNowUrls(urls: string[]): Promise<void> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))]
  if (unique.length === 0) return

  const host = new URL(getSiteUrl()).host
  const key = getIndexNowKey()
  const keyLocation = `${getSiteUrl()}/${key}.txt`

  const body = {
    host,
    key,
    keyLocation,
    urlList: unique.slice(0, 10_000),
  }

  await Promise.allSettled(
    INDEXNOW_ENDPOINTS.map(async (endpoint) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok && res.status !== 202) {
        console.warn(`[indexnow] ${endpoint} → ${res.status}`)
      }
    })
  )
}

export function buildNewsIndexNowUrl(slug: string): string {
  const base = getSiteUrl().replace(/\/$/, '')
  return `${base}/haber/${slug.trim()}`
}

/** Ping IndexNow + sitemap endpoints after a article is published or updated. */
export async function notifyPublishedArticle(slug: string): Promise<void> {
  const normalized = slug.trim()
  if (!normalized) return

  const { pingSitemaps } = await import('@/lib/seo')
  await Promise.allSettled([
    submitIndexNowUrls([buildNewsIndexNowUrl(normalized)]),
    pingSitemaps(),
  ])
}
