/**
 * Image Sitemap — all published articles with a coverImageUrl.
 * Fetches up to 2000 articles in batches to avoid Firestore limits.
 * Spec: https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps
 */
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BATCH_SIZE = 500
const MAX_IMAGES = 2000

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function GET() {
  const base = getSiteUrl()
  let items = ''
  let totalImages = 0

  try {
    const db = getAdminFirestore()
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined

    while (totalImages < MAX_IMAGES) {
      let query = db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(BATCH_SIZE)

      if (lastDoc) {
        query = query.startAfter(lastDoc)
      }

      const snap = await query.get()
      if (snap.empty) break

      for (const doc of snap.docs) {
        const d = doc.data() as {
          title?: string
          slug?: string
          coverImageUrl?: string
          imageCaption?: string
          publishedAt?: number
        }
        if (!d.coverImageUrl?.trim()) continue
        if (totalImages >= MAX_IMAGES) break

        const slug = d.slug?.trim() || doc.id
        const path = slug !== doc.id ? ROUTES.NEWS_DETAIL(slug) : ROUTES.POST_DETAIL(doc.id)
        const url = `${base}${path}`
        const title = escapeXml(d.title?.trim() || 'Haber')
        const caption = escapeXml(d.imageCaption?.trim() || d.title?.trim() || 'Haber görseli')

        items += `
  <url>
    <loc>${escapeXml(url)}</loc>
    <image:image>
      <image:loc>${escapeXml(d.coverImageUrl.trim())}</image:loc>
      <image:title>${title}</image:title>
      <image:caption>${caption}</image:caption>
    </image:image>
  </url>`
        totalImages++
      }

      lastDoc = snap.docs[snap.docs.length - 1]
      if (snap.docs.length < BATCH_SIZE) break
    }
  } catch (err) {
    console.error('[images-sitemap] error:', err)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${items}
</urlset>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=43200',
    },
  })
}
