import { NextResponse } from 'next/server'
import { getSiteUrl } from '@/lib/seo'
import { buildSitemapIndexXml, getSitemapPageCount } from '@/lib/sitemap/mainSitemap'

export const runtime = 'nodejs'
export const revalidate = 172800

export async function GET() {
  const base = getSiteUrl()
  const pageCount = await getSitemapPageCount()
  const body = buildSitemapIndexXml(base, pageCount)

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 's-maxage=172800, stale-while-revalidate=7200',
    },
  })
}
