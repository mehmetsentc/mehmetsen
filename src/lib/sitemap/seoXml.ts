import type { MetadataRoute } from 'next'

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function urlsetXml(entries: MetadataRoute.Sitemap): string {
  const rows = entries
    .map((entry) => {
      const lastMod =
        entry.lastModified instanceof Date
          ? entry.lastModified.toISOString()
          : entry.lastModified
            ? new Date(entry.lastModified).toISOString()
            : ''
      const lastmodTag = lastMod ? `<lastmod>${lastMod}</lastmod>` : ''
      const freq = entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : ''
      const pri = entry.priority !== undefined ? `<priority>${entry.priority}</priority>` : ''
      return `  <url><loc>${xmlEscape(entry.url)}</loc>${lastmodTag}${freq}${pri}</url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows}
</urlset>`
}
