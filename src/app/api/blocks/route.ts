/**
 * POST /api/blocks   → kullanıcıyı engelle
 * DELETE /api/blocks → engeli kaldır
 * Apple Guideline 1.2: abusive user blocking mekanizması.
 */
import { NextResponse } from 'next/server'
import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rateKey = `block:${auth.uid}:${getClientIp(request)}`
  if (!checkRateLimit(rateKey, 20, 60_000)) return rateLimitResponse()

  const { blockedUserId } = (await request.json()) as { blockedUserId?: unknown }
  if (typeof blockedUserId !== 'string' || !blockedUserId.trim()) {
    return NextResponse.json({ error: 'blockedUserId required' }, { status: 400 })
  }
  if (blockedUserId === auth.uid) {
    return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 })
  }

  // Tekrar engel koymayı önle
  const existing = await getDocs(
    query(
      collection(db, Collections.BLOCKS),
      where('blockerId', '==', auth.uid),
      where('blockedUserId', '==', blockedUserId)
    )
  )
  if (!existing.empty) return NextResponse.json({ ok: true, alreadyBlocked: true })

  await addDoc(collection(db, Collections.BLOCKS), {
    blockerId: auth.uid,
    blockedUserId: blockedUserId.trim(),
    createdAt: serverTimestamp(),
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { blockedUserId } = (await request.json()) as { blockedUserId?: unknown }
  if (typeof blockedUserId !== 'string') {
    return NextResponse.json({ error: 'blockedUserId required' }, { status: 400 })
  }

  const snap = await getDocs(
    query(
      collection(db, Collections.BLOCKS),
      where('blockerId', '==', auth.uid),
      where('blockedUserId', '==', blockedUserId)
    )
  )
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))

  return NextResponse.json({ ok: true })
}
