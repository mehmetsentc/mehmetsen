/**
 * REELS-SEO-1: a watch page per reel. Google indexes a video only when it is the
 * main content of its page — 558 of our videos were left out with «Video,
 * izleme sayfasında yer almıyor» and reels never reached the video sitemap.
 * /video/{slug} shows the reel as the page's main content; the article stays
 * the canonical text page and the two link to each other.
 */
export function reelWatchPath(slug: string): string {
  return `/video/${encodeURIComponent(slug.trim())}`
}

export function isoDuration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null
  return `PT${Math.round(seconds)}S`
}

export function buildReelVideoJsonLd(input: {
  title: string
  description: string
  pageUrl: string
  articleUrl: string
  videoUrl: string
  thumbnailUrl: string | null
  uploadDate: string
  seconds: number | null
  siteUrl: string
  siteName: string
}): Record<string, unknown> {
  const duration = isoDuration(input.seconds)
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: input.title.slice(0, 110),
    description: (input.description || input.title).slice(0, 500),
    ...(input.thumbnailUrl ? { thumbnailUrl: [input.thumbnailUrl] } : {}),
    uploadDate: input.uploadDate,
    contentUrl: input.videoUrl,
    ...(duration ? { duration } : {}),
    url: input.pageUrl,
    inLanguage: 'tr-TR',
    isFamilyFriendly: true,
    mainEntityOfPage: input.pageUrl,
    isBasedOn: input.articleUrl,
    publisher: {
      '@type': 'NewsMediaOrganization',
      name: input.siteName,
      url: input.siteUrl,
      logo: { '@type': 'ImageObject', url: `${input.siteUrl}/brand/nahaber-logo.png`, width: 512, height: 512 },
    },
  }
}
