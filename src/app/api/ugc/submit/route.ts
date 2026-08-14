import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Reader UGC news tip → newsDrafts (pending_review).
 * Uses Admin SDK so client Firestore rules do not block non-publisher authors.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7).trim())
    const body = (await request.json()) as {
      title?: string
      description?: string
      city?: string | null
      coverImageUrl?: string | null
      videoUrl?: string | null
      categoryId?: string
    }

    const title = String(body.title ?? '').trim()
    const description = String(body.description ?? '').trim()
    if (title.length < 4 || description.length < 20) {
      return NextResponse.json(
        { error: 'Başlık en az 4, metin en az 20 karakter olmalı' },
        { status: 400 }
      )
    }

    const db = getAdminFirestore()
    const userSnap = await db.collection(Collections.USERS).doc(decoded.uid).get()
    const user = userSnap.data() || {}
    const username = String(user.username || decoded.email?.split('@')[0] || 'user')
    const displayName = String(user.displayName || user.name || username)

    const ref = await db.collection(Collections.NEWS_DRAFTS).add({
      title,
      description,
      summary: description.slice(0, 280),
      city: body.city?.trim() || null,
      coverImageUrl: body.coverImageUrl || null,
      videoUrl: body.videoUrl || null,
      thumbnail: body.coverImageUrl || null,
      authorId: decoded.uid,
      author: username,
      authorUsername: username,
      authorDisplayName: displayName,
      source: 'ugc',
      type: 'ugc',
      draftStatus: 'pending_review',
      categoryId: body.categoryId || 'gundem',
      aiGenerated: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true, id: ref.id })
  } catch (e) {
    console.error('[ugc/submit]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Gönderilemedi' },
      { status: 500 }
    )
  }
}
