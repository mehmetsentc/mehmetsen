import { NextResponse } from 'next/server'
import { getSiteUrl } from '@/lib/seo'
import { buildCitiesSitemap, urlsetXml } from '@/lib/sitemap/seoSitemaps'

export const runtime = 'nodejs'
export const revalidate = 86400

export async function GET() {
  try {
    const body = await buildCitiesSitemap(getSiteUrl())
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600',
      },
    })
  } catch (err) {
    console.error('[sitemap-cities]', err)
    return new NextResponse(urlsetXml([]), {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }
}
