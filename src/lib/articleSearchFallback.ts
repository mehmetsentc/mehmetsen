/**
 * Canlı arama fallback — scraper başarısız olunca haber başlığıyla
 * alternatif kaynak URL'leri bulur (Serper veya Brave Search).
 *
 * Env:
 *   SERPER_API_KEY   — https://serper.dev (önerilen, ~$1/1000 arama)
 *   BRAVE_SEARCH_API_KEY — https://brave.com/search/api/
 */

const NEWS_DOMAINS = [
  'hurriyet.com.tr', 'sozcu.com.tr', 'ntv.com.tr', 'haberturk.com',
  'cnnturk.com', 'milliyet.com.tr', 'sabah.com.tr', 'aa.com.tr',
  'trthaber.com', 'cumhuriyet.com.tr', 'bianet.org', 't24.com.tr',
  'bbc.com', 'reuters.com', 'apnews.com',
]

function isNewsUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return NEWS_DOMAINS.some((d) => host === d || host.endsWith('.' + d))
  } catch {
    return false
  }
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of urls) {
    try {
      const u = new URL(raw)
      u.hash = ''
      const key = u.toString()
      if (!seen.has(key)) {
        seen.add(key)
        out.push(key)
      }
    } catch {
      // skip invalid
    }
  }
  return out
}

async function searchViaSerper(query: string): Promise<string[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim()
  if (!apiKey) return []

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        gl: 'tr',
        hl: 'tr',
        num: 8,
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return []

    const data = (await res.json()) as {
      organic?: Array<{ link?: string }>
      news?: Array<{ link?: string }>
    }
    const urls: string[] = []
    for (const item of data.news ?? []) {
      if (item.link) urls.push(item.link)
    }
    for (const item of data.organic ?? []) {
      if (item.link) urls.push(item.link)
    }
    return dedupeUrls(urls).filter(isNewsUrl)
  } catch {
    return []
  }
}

async function searchViaBrave(query: string): Promise<string[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (!apiKey) return []

  try {
    const params = new URLSearchParams({
      q: query,
      count: '8',
      search_lang: 'tr',
      country: 'TR',
    })
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return []

    const data = (await res.json()) as {
      web?: { results?: Array<{ url?: string }> }
    }
    const urls = (data.web?.results ?? [])
      .map((r) => r.url)
      .filter((u): u is string => Boolean(u))
    return dedupeUrls(urls).filter(isNewsUrl)
  } catch {
    return []
  }
}

/**
 * Haber başlığına göre alternatif kaynak URL'leri döndürür.
 * Serper öncelikli; yoksa Brave.
 */
export async function searchArticleUrls(
  title: string,
  excludeUrl?: string
): Promise<string[]> {
  const query = `${title.trim()} haber`.slice(0, 120)
  if (!query) return []

  let urls = await searchViaSerper(query)
  if (urls.length === 0) {
    urls = await searchViaBrave(query)
  }

  if (excludeUrl) {
    const norm = excludeUrl.replace(/\/$/, '')
    urls = urls.filter((u) => u.replace(/\/$/, '') !== norm)
  }

  return urls.slice(0, 5)
}

export function isArticleSearchConfigured(): boolean {
  return Boolean(
    process.env.SERPER_API_KEY?.trim() || process.env.BRAVE_SEARCH_API_KEY?.trim()
  )
}
