import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

interface UpdatePayload {
  title?: string
  summary?: string
  content?: string
  spot?: string
  categoryId?: string
  status?: string
  tags?: string[]
}

/** PUT /api/admin/news/[id] — manually update a news article */
export async function PUT(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  let body: UpdatePayload
  try {
    body = await request.json() as UpdatePayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Build safe update — only allow whitelisted fields
  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    manuallyEdited: true,
    manualEditedBy: auth.uid,
    manualEditedAt: FieldValue.serverTimestamp(),
  }

  if (body.title?.trim())      update.title = body.title.trim()
  if (body.summary?.trim())    update.summary = body.summary.trim()
  if (body.content?.trim())    update.content = body.content.trim()
  if (body.spot?.trim())       update.spot = body.spot.trim()
  if (body.categoryId?.trim()) update.categoryId = body.categoryId.trim()
  if (body.status?.trim())     update.status = body.status.trim()
  if (Array.isArray(body.tags)) update.tags = body.tags

  const db = getAdminFirestore()

  // Check which collection this doc is in (news vs posts)
  const newsRef = db.collection(Collections.NEWS).doc(id)
  const newsSnap = await newsRef.get()

  if (!newsSnap.exists) {
    // Try posts collection
    const postsRef = db.collection(Collections.POSTS).doc(id)
    const postsSnap = await postsRef.get()
    if (!postsSnap.exists) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }
    await postsRef.update(update)
    return NextResponse.json({ ok: true, collection: 'posts' })
  }

  await newsRef.update(update)

  // If the article is also published to the posts collection, sync it
  const data = newsSnap.data()
  if (data?.status === 'published' || body.status === 'published') {
    const postsRef = db.collection(Collections.POSTS).doc(id)
    const postsSnap = await postsRef.get()
    if (postsSnap.exists) {
      await postsRef.update(update)
    }
  }

  return NextResponse.json({ ok: true, collection: 'news' })
}
