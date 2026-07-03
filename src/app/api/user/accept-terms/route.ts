/**
 * POST /api/user/accept-terms
 * Kullanıcının EULA/Kullanım Koşulları'nı kabul ettiğini kaydeder.
 * Apple Guideline 1.2: User-Generated Content — EULA zorunluluğu.
 */
import { NextResponse } from 'next/server'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await updateDoc(doc(db, Collections.USERS, auth.uid), {
    termsAcceptedAt: serverTimestamp(),
  })

  return NextResponse.json({ ok: true })
}
