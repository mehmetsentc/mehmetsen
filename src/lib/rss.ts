/**
 * Shared RSS/Atom feed builder for NaHaber.
 */
import { getSiteUrl } from '@/lib/seo'

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export interface RssItem {
  title: string
  link: string
  description: string
  pubDate: string      // ISO date string
  guid: string
  category?: string
  imageUrl?: string
  author?: string
  contentEncoded?: string
}

export function buildRssFeed({
  title,
  description,
  link,
  items,
  publisherEmail = 'bilgi@nahaber.com',
}: {
  title: string
  description: string
  link: string
  items: RssItem[]
  publisherEmail?: string
}): string {
  const base = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const now = new Date().toUTCString()
  const year = new Date().getFullYear()

  const itemsXml = items
    .map((item) => {
      const enclosure = item.imageUrl
        ? `<enclosure url="${escapeXml(item.imageUrl)}" type="image/jpeg" length="0" />`
        : ''
      const media = item.imageUrl
        ? `<media:content url="${escapeXml(item.imageUrl)}" medium="image" />`
        : ''
      const category = item.category
        ? `<category>${escapeXml(item.category)}</category>`
        : ''
      const author = item.author
        ? `<author>${escapeXml(item.author)}</author>`
        : ''
      const contentEncoded = item.contentEncoded
        ? `<content:encoded><![CDATA[${item.contentEncoded}]]></content:encoded>`
        : ''

      return `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <guid isPermaLink="true">${item.guid}</guid>
      <description><![CDATA[${item.description}]]></description>
      <pubDate>${new Date(item.pubDate).toUTCString()}</pubDate>
      ${category}
      ${author}
      ${contentEncoded}
      ${enclosure}
      ${media}
    </item>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title><![CDATA[${title}]]></title>
    <link>${base}</link>
    <description><![CDATA[${description}]]></description>
    <language>tr</language>
    <copyright>Copyright ${year} ${siteName}</copyright>
    <managingEditor>${publisherEmail} (${siteName})</managingEditor>
    <webMaster>${publisherEmail} (${siteName})</webMaster>
    <generator>${siteName} RSS</generator>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>5</ttl>
    <atom:link href="${link}" rel="self" type="application/rss+xml" />
    <image>
      <url>${base}/brand/nahaber-logo.png</url>
      <title><![CDATA[${title}]]></title>
      <link>${base}</link>
    </image>
${itemsXml}
  </channel>
</rss>`
}
