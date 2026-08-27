import { NextResponse } from 'next/server'
import { getSiteUrl } from '@/lib/seo'
import { buildEventsSitemap } from '@/lib/sitemap/seoSitemaps'

export const runtime = 'nodejs'
export const revalidate = 86400

export async function GET() {
  const body = await buildEventsSitemap(getSiteUrl())
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600',
    },
  })
}
