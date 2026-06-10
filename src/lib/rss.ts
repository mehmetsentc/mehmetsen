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
}

export function buildRssFeed({
  title,
  description,
  link,
  items,
}: {
  title: string
  description: string
  link: string
  items: RssItem[]
}): string {
  const base = getSiteUrl()
  const now = new Date().toUTCString()

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

      return `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <guid isPermaLink="true">${item.guid}</guid>
      <description><![CDATA[${item.description}]]></description>
      <pubDate>${new Date(item.pubDate).toUTCString()}</pubDate>
      ${category}
      ${author}
      ${enclosure}
      ${media}
    </item>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title><![CDATA[${title}]]></title>
    <link>${link}</link>
    <description><![CDATA[${description}]]></description>
    <language>tr</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>5</ttl>
    <atom:link href="${link}" rel="self" type="application/rss+xml" />
    <image>
      <url>${base}/brand/nahaber-logo.png</url>
      <title><![CDATA[${title}]]></title>
      <link>${link}</link>
    </image>
${itemsXml}
  </channel>
</rss>`
}
