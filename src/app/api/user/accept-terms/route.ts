/**
 * POST /api/user/accept-terms — record genuine EULA acceptance (Admin SDK).
 * GET  /api/user/accept-terms — whether the authenticated user already accepted (no PII).
 *
 * Apple Guideline 1.2: User-Generated Content — EULA required.
 */
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function termsToIso(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString()
    } catch {
      return null
    }
  }
  return null
}

/** Non-sensitive: has the authenticated user already accepted terms? */
export async function GET(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const snap = await getAdminFirestore().collection(Collections.USERS).doc(auth.uid).get()
  const termsAcceptedAt = termsToIso(snap.exists ? snap.data()?.termsAcceptedAt : null)
  return NextResponse.json({
    accepted: Boolean(termsAcceptedAt),
    termsAcceptedAt,
  })
}

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await getAdminFirestore().collection(Collections.USERS).doc(auth.uid).set(
    { termsAcceptedAt: FieldValue.serverTimestamp() },
    { merge: true }
  )

  return NextResponse.json({ ok: true })
}
