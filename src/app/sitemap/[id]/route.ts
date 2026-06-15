import { NextResponse } from 'next/server'
import { getSitemapPage, getSitemapPageCount, sitemapEntriesToXml } from '@/lib/sitemap/mainSitemap'

export const runtime = 'nodejs'
export const revalidate = 3600

export async function generateStaticParams() {
  try {
    const count = await getSitemapPageCount()
    return Array.from({ length: count }, (_, id) => ({ id: `${id}.xml` }))
  } catch {
    return [{ id: '0.xml' }]
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await context.params
  const id = Number.parseInt(rawId.replace(/\.xml$/, ''), 10)
  if (!Number.isFinite(id) || id < 0) {
    return NextResponse.json({ error: 'Invalid sitemap id' }, { status: 400 })
  }

  const entries = await getSitemapPage(id)
  const body = entries.length
    ? `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntriesToXml(entries)}
</urlset>`
    : `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=600',
    },
  })
}
