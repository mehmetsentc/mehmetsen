/** Shared image-sitemap body. Sitemap semantics allow hours, not seconds. */
export const IMAGE_SITEMAP_REVALIDATE_S = 6 * 60 * 60

export type ImageSitemapCacheState = 'hit' | 'miss' | 'stale'

export function createTtlSingleCache(
  load: () => Promise<string>,
  ttlMs: number,
  now: () => number = Date.now,
  circuitOpen: () => boolean = () => false
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
          entry = { xml, at: now() }
          return xml
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
