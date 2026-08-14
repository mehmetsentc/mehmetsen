import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, type DocumentData } from 'firebase-admin/firestore'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DraftStatus = 'pending_review' | 'approved' | 'rejected'

function isUgc(data: DocumentData): boolean {
  return data.source === 'ugc' || data.type === 'ugc'
}

function toMillis(value: unknown): number {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'object' && value !== null && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    return ((value as { _seconds: number })._seconds || 0) * 1000
  }
  return 0
}

function mapDoc(id: string, data: DocumentData, status: DraftStatus) {
  return {
    id,
    title: data.title ?? '',
    description: data.description ?? data.summary ?? '',
    summary: data.summary ?? '',
    city: data.city ?? null,
    coverImageUrl: data.coverImageUrl ?? data.thumbnail ?? null,
    videoUrl: data.videoUrl ?? null,
    authorId: data.authorId ?? '',
    author: data.author ?? '',
    authorUsername: data.authorUsername ?? '',
    authorDisplayName: data.authorDisplayName ?? data.author ?? '',
    draftStatus: data.draftStatus ?? status,
    categoryId: data.categoryId ?? 'gundem',
    createdAt: toMillis(data.createdAt),
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = (request.nextUrl.searchParams.get('status') || 'pending_review') as DraftStatus
  if (!['pending_review', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || 40), 100)
  const db = getAdminFirestore()

  try {
    // Prefer composite when available; otherwise filter UGC client-side
    // (draftStatus+createdAt index already exists in production).
    let items: ReturnType<typeof mapDoc>[] = []
    let fallback = false
    try {
      const snap = await db
        .collection(Collections.NEWS_DRAFTS)
        .where('source', '==', 'ugc')
        .where('draftStatus', '==', status)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get()
      items = snap.docs.map((d) => mapDoc(d.id, d.data(), status))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/index|FAILED_PRECONDITION/i.test(msg)) throw err
      fallback = true
      const broad = await db
        .collection(Collections.NEWS_DRAFTS)
        .where('draftStatus', '==', status)
        .orderBy('createdAt', 'desc')
        .limit(Math.min(limit * 5, 200))
        .get()
      items = broad.docs
        .filter((d) => isUgc(d.data()))
        .slice(0, limit)
        .map((d) => mapDoc(d.id, d.data(), status))
    }

    return NextResponse.json({ items, fallback })
  } catch (e) {
    console.error('[admin/submissions GET]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'List failed' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const auth =
    (await verifyCmsToken(request, 'news:publish')) ||
    (await verifyCmsToken(request, 'news:edit'))
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    id?: string
    action?: 'approve' | 'reject'
  }
  if (!body.id || !body.action) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 })
  }

  const db = getAdminFirestore()
  const ref = db.collection(Collections.NEWS_DRAFTS).doc(body.id)
  const snap = await ref.get()
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const data = snap.data() || {}
  if (!isUgc(data)) {
    return NextResponse.json({ error: 'Not a UGC submission' }, { status: 400 })
  }

  try {
    if (body.action === 'reject') {
      await ref.set(
        { draftStatus: 'rejected', updatedAt: FieldValue.serverTimestamp(), reviewedBy: auth.uid },
        { merge: true }
      )
      return NextResponse.json({ ok: true, status: 'rejected' })
    }

    const title = String(data.title ?? '').trim() || 'Okuyucu haberi'
    const description = String(data.description ?? data.summary ?? '')
    const slugBase = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)
    const slug = `${slugBase || 'ugc'}-${Date.now()}`

    await db.collection(Collections.NEWS).add({
      title,
      description,
      summary: String(data.summary ?? description).slice(0, 280),
      slug,
      status: 'published',
      categoryId: data.categoryId ?? 'gundem',
      coverImageUrl: data.coverImageUrl ?? data.thumbnail ?? null,
      videoUrl: data.videoUrl ?? null,
      thumbnail: data.coverImageUrl ?? data.thumbnail ?? null,
      authorId: data.authorId ?? null,
      author: data.author ?? null,
      authorUsername: data.authorUsername ?? null,
      authorDisplayName: data.authorDisplayName ?? data.author ?? null,
      source: 'ugc',
      type: 'ugc',
      city: data.city ?? null,
      publishedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      aiGenerated: false,
      publishedFromDraftId: body.id,
      publishedBy: auth.uid,
    })

    await ref.set(
      { draftStatus: 'approved', updatedAt: FieldValue.serverTimestamp(), reviewedBy: auth.uid },
      { merge: true }
    )

    return NextResponse.json({ ok: true, status: 'approved', slug })
  } catch (e) {
    console.error('[admin/submissions PATCH]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Action failed' },
      { status: 500 }
    )
  }
}
