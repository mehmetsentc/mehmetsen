/** Shared image-sitemap body. Sitemap semantics allow hours, not seconds. */
export const IMAGE_SITEMAP_REVALIDATE_S = 6 * 60 * 60

export type ImageSitemapCacheState = 'hit' | 'miss' | 'stale'

export function sitemapXmlHasEntries(xml: string): boolean {
  return xml.includes('<url>') || xml.includes('<sitemap>')
}

export function createTtlSingleCache(
  load: () => Promise<string>,
  ttlMs: number,
  now: () => number = Date.now,
  circuitOpen: () => boolean = () => false,
  options?: { serveStaleOnError?: boolean; skipEmpty?: boolean }
) {
  let entry: { xml: string; at: number } | null = null
  let inflight: Promise<string> | null = null

  return async function getImageSitemapCached(): Promise<{
    xml: string
    cache: ImageSitemapCacheState
  }> {
    const t = now()
    if (entry && t - entry.at < ttlMs) return { xml: entry.xml, cache: 'hit' }
    if (entry && circuitOpen()) return { xml: entry.xml, cache: 'stale' }
    if (!inflight) {
      const pending = load()
        .then((xml) => {
          if (options?.skipEmpty && !sitemapXmlHasEntries(xml)) {
            return entry ? entry.xml : xml
          }
          entry = { xml, at: now() }
          return xml
        })
        .catch((error: unknown) => {
          if (options?.serveStaleOnError && entry) return entry.xml
          throw error
        })
        .finally(() => {
          if (inflight === pending) inflight = null
        })
      inflight = pending
    }
    const xml = await inflight
    return { xml, cache: 'miss' }
  }
}
