import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, Collections } from '@/lib/firebase/admin'
import { formatPublicSourceLabel } from '@/lib/postUtils'

export const runtime = 'nodejs'
export const revalidate = 120

export interface TopNewsItem {
  id: string
  title: string
  slug: string
  imageUrl: string | null
  categoryId: string
  publishedAt: number
  source?: string
  spot?: string
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category') || null
  const limit = Math.min(Number(searchParams.get('limit') || 20), 20)

  try {
    const db = getAdminFirestore()
    let q = db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(limit)

    if (category && category !== 'all') {
      q = db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .where('categoryId', '==', category)
        .orderBy('publishedAt', 'desc')
        .limit(limit)
    }

    const snap = await q.get()
    const items: TopNewsItem[] = snap.docs.map((doc) => {
      const d = doc.data() as Record<string, unknown>
      return {
        id: doc.id,
        title: String(d.title ?? ''),
        slug: String(d.slug ?? doc.id),
        imageUrl: (d.coverImageUrl as string | null) ?? null,
        categoryId: String(d.categoryId ?? ''),
        publishedAt: Number(d.publishedAt ?? 0),
        source: d.source ? formatPublicSourceLabel(String(d.source)) || undefined : undefined,
        spot: d.spot ? String(d.spot) : undefined,
      }
    })

    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    })
  } catch (err) {
    console.error('[api/news/top]', err)
    return NextResponse.json({ error: 'Haberler alınamadı' }, { status: 502 })
  }
}
