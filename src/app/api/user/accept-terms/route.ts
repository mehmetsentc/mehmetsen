/**
 * POST /api/user/accept-terms
 * Kullanıcının EULA/Kullanım Koşulları'nı kabul ettiğini kaydeder.
 * Apple Guideline 1.2: User-Generated Content — EULA zorunluluğu.
 */
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await getAdminFirestore().collection(Collections.USERS).doc(auth.uid).set(
    { termsAcceptedAt: FieldValue.serverTimestamp() },
    { merge: true }
  )

  return NextResponse.json({ ok: true })
}
