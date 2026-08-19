export function isFreshEnough(
  publishedAt: Date | null | undefined,
  freshnessHours: number,
  now = new Date()
): boolean {
  if (!publishedAt) return false
  const ageMs = now.getTime() - publishedAt.getTime()
  if (Number.isNaN(ageMs)) return false
  return ageMs <= freshnessHours * 3600 * 1000
}

export function shouldSkipStaleDiscovery(opts: {
  publishedAt: Date | null | undefined
  freshnessHours: number
  discoveryMethod: string
  now?: Date
}): boolean {
  if (!opts.publishedAt) {
    return opts.discoveryMethod === 'SITEMAP' || opts.discoveryMethod === 'NEWS_SITEMAP'
  }
  return !isFreshEnough(opts.publishedAt, opts.freshnessHours, opts.now)
}
