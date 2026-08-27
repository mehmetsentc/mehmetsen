import { NextResponse } from 'next/server'
import { getSiteUrl } from '@/lib/seo'
import { buildCategoriesSitemap } from '@/lib/sitemap/entitySitemaps'
import { urlsetXml } from '@/lib/sitemap/seoXml'

export const runtime = 'nodejs'
export const revalidate = 86400

export async function GET() {
  try {
    const body = await buildCategoriesSitemap(getSiteUrl())
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600',
      },
    })
  } catch (err) {
    console.error('[sitemap-categories]', err)
    return new NextResponse(urlsetXml([]), {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }
}
