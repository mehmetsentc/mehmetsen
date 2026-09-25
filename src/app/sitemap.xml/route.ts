import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getSiteUrl } from '@/lib/seo'
import { getCitySlugFromHost } from '@/lib/cityHost'
import { buildSitemapIndexXmlAsync } from '@/lib/sitemap/sitemapIndex'
import { getDistrictsForProvince } from '@/constants/cities'
import { buildCityCanonicalUrl } from '@/lib/seo/cityPageMetadata'
import { xmlEscape } from '@/lib/sitemap/seoXml'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// SEO-1C.1: the www index also summarizes monthly article shards (bounded, cached).
export const maxDuration = 60

// ─── City sitemap ─────────────────────────────────────────────────────────────

const CITY_STATIC = [
  { path: '/',                             priority: 1.0, freq: 'hourly'  },
  { path: '/etkinlik',                     priority: 0.8, freq: 'daily'   },
  { path: '/ilceler',                      priority: 0.7, freq: 'weekly'  },
  { path: '/is-ilanlari',                  priority: 0.7, freq: 'daily'   },
  { path: '/nobetci-eczaneler',            priority: 0.7, freq: 'daily'   },
]
// SEO-1C.3: /spor (soft redirect), /is-ilanlari/{eleman-ariyorum,is-ariyorum}
// (forms, canonical www) and /editoryal-ilkeler (canonical www) are not
// self-canonical city pages and are no longer listed here.

const CITY_CATEGORIES = [
  'gundem',      'siyaset',     'ekonomi',     'yasam',
  'egitim',      'kultur',      'turizm',      'asayis',
  'spor',        'gastronomi',  'son-dakika',  'saglik',
  'bilim',       'teknoloji',   'magazin',     'otomobil',
  'meteoroloji',
]

function xmlUrl(loc: string, freq: string, priority: number, lastmod?: string): string {
  const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
  return `  <url><loc>${xmlEscape(loc)}</loc>${lastmodTag}<changefreq>${freq}</changefreq><priority>${priority}</priority></url>`
}

async function buildCitySitemapXml(citySlug: string): Promise<string> {
  const base = `https://${citySlug}.nahaber.com`

  const staticRows = CITY_STATIC.map(({ path, priority, freq }) =>
    xmlUrl(`${base}${path}`, freq, priority)
  )

  const categoryRows = CITY_CATEGORIES.map((slug) =>
    xmlUrl(`${base}/kategori/${slug}`, 'hourly', 0.8)
  )

  // SEO-1C.3: district landing pages (/ilceler/{slug}) — same source and same
  // canonical helper as src/app/ilceler/[slug]/page.tsx, so every listed URL is
  // the page's own canonical. City article copies (/haber/*) are NOT listed:
  // their canonical owner is www (monthly article shards).
  const districtRows = getDistrictsForProvince(citySlug)
    .map((d) => buildCityCanonicalUrl(citySlug, ['ilceler', d.slug]))
    .filter((loc): loc is string => Boolean(loc))
    .map((loc) => xmlUrl(loc, 'daily', 0.7))

  const rows = [...staticRows, ...districtRows, ...categoryRows].join('\n')
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
