/**
 * SOCIAL-UTM-1: tag article links in social posts so Analytics shows which
 * platform / format / account brought each reader. The article page's canonical
 * is the clean /haber/{slug} URL, so tagged links never become separate pages
 * for search engines.
 */
export type SocialUtmPlatform = 'facebook' | 'instagram' | 'threads' | 'twitter' | 'youtube'
export type SocialUtmFormat = 'post' | 'story' | 'reel' | 'video_story'

export function withSocialUtm(
  url: string | null | undefined,
  opts: { platform: SocialUtmPlatform; format: SocialUtmFormat; accountId?: string | null },
): string | undefined {
  const raw = url?.trim()
  if (!raw) return undefined
  if (process.env.SOCIAL_UTM === 'off') return raw
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return raw
  }
  if (u.searchParams.has('utm_source')) return raw
  u.searchParams.set('utm_source', opts.platform)
  u.searchParams.set('utm_medium', 'social')
  u.searchParams.set('utm_campaign', opts.format)
  const account = opts.accountId?.trim()
  if (account) u.searchParams.set('utm_content', account.slice(0, 80))
  return u.toString()
}

/** Same payload with its article link tagged for one platform. */
export function payloadWithUtm<T extends { articleUrl?: string }>(
  payload: T,
  platform: SocialUtmPlatform,
  format: SocialUtmFormat,
  accountId?: string | null,
): T {
  if (!payload.articleUrl) return payload
  return { ...payload, articleUrl: withSocialUtm(payload.articleUrl, { platform, format, accountId }) }
}
