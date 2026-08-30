import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getSiteUrl } from '@/lib/seo'
import { getCitySlugFromHost } from '@/lib/cityHost'
import { buildSitemapIndexXmlAsync } from '@/lib/sitemap/sitemapIndex'
import { getCanonicalPublishedNewsForSitemap } from '@/lib/canonical/canonicalEligibility'
import { ROUTES } from '@/constants/routes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── City sitemap ─────────────────────────────────────────────────────────────

const CITY_STATIC = [
  { path: '/',                             priority: 1.0, freq: 'hourly'  },
  { path: '/etkinlik',                     priority: 0.8, freq: 'daily'   },
  { path: '/spor',                         priority: 0.8, freq: 'daily'   },
  { path: '/ilceler',                      priority: 0.7, freq: 'weekly'  },
  { path: '/is-ilanlari',                  priority: 0.7, freq: 'daily'   },
  { path: '/is-ilanlari/eleman-ariyorum',  priority: 0.6, freq: 'daily'   },
  { path: '/is-ilanlari/is-ariyorum',      priority: 0.6, freq: 'daily'   },
  { path: '/nobetci-eczaneler',            priority: 0.7, freq: 'daily'   },
  { path: '/editoryal-ilkeler',            priority: 0.3, freq: 'monthly' },
]

const CITY_CATEGORIES = [
  'gundem',      'siyaset',     'ekonomi',     'yasam',
  'egitim',      'kultur',      'turizm',      'asayis',
  'spor',        'gastronomi',  'son-dakika',  'saglik',
  'bilim',       'teknoloji',   'magazin',     'otomobil',
  'meteoroloji',
]

function xmlUrl(loc: string, freq: string, priority: number, lastmod?: string): string {
  const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
  return `  <url><loc>${loc}</loc>${lastmodTag}<changefreq>${freq}</changefreq><priority>${priority}</priority></url>`
}

async function buildCitySitemapXml(citySlug: string): Promise<string> {
  const base = `https://${citySlug}.nahaber.com`

  const staticRows = CITY_STATIC.map(({ path, priority, freq }) =>
    xmlUrl(`${base}${path}`, freq, priority)
  )

  const categoryRows = CITY_CATEGORIES.map((slug) =>
    xmlUrl(`${base}/kategori/${slug}`, 'hourly', 0.8)
  )

  // Recent city articles (last 30 days) - PostgreSQL Canonical Only
  let articleRows: string[] = []
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const rows = await getCanonicalPublishedNewsForSitemap({
      citySlug,
      from: cutoff,
      limit: 500,
    })

    articleRows = rows.map((d) => {
      const slug = d.slug?.trim() || d.id
      const path = ROUTES.NEWS_DETAIL(slug)
      const lastmod = (d.updatedAt ?? d.publishedAt ?? new Date()).toISOString()
      return xmlUrl(`${base}${path}`, 'weekly', 0.7, lastmod)
    })
  } catch (err) {
    console.error('[sitemap.xml] city article fetch error:', err)
  }

  const rows = [...staticRows, ...categoryRows, ...articleRows].join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows}
</urlset>`
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const headerStore = await headers()
    const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? ''
    const citySlug = getCitySlugFromHost(host)

    if (citySlug) {
      const body = await buildCitySitemapXml(citySlug)
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
        },
      })
    }

    const base = getSiteUrl()
    const body = await buildSitemapIndexXmlAsync(base)
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 's-maxage=172800, stale-while-revalidate=7200',
      },
    })
  } catch (err) {
    console.error('[sitemap.xml] fatal:', err)
    const base = getSiteUrl()
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${base}/news-sitemap.xml</loc></sitemap>
</sitemapindex>`
    return new NextResponse(fallback, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
      },
    })
  }
}
