/**
 * POST /api/reports
 * İçerik veya kullanıcı şikayeti oluşturur.
 * Apple Guideline 1.2: User-Generated Content — şikayet mekanizması.
 */
import { NextResponse } from 'next/server'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_TYPES = ['comment', 'post', 'user'] as const
const VALID_REASONS = [
  'spam',
  'harassment',
  'hate_speech',
  'misinformation',
  'violence',
  'nudity',
  'other',
] as const

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateKey = `report:${auth.uid}:${getClientIp(request)}`
  if (!checkRateLimit(rateKey, 10, 60_000)) {
    return rateLimitResponse()
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { targetId, targetType, reason, note } = body as {
    targetId?: unknown
    targetType?: unknown
    reason?: unknown
    note?: unknown
  }

  if (typeof targetId !== 'string' || !targetId.trim()) {
    return NextResponse.json({ error: 'targetId required' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(targetType as (typeof VALID_TYPES)[number])) {
    return NextResponse.json({ error: 'invalid targetType' }, { status: 400 })
  }
  if (!VALID_REASONS.includes(reason as (typeof VALID_REASONS)[number])) {
    return NextResponse.json({ error: 'invalid reason' }, { status: 400 })
  }

  await addDoc(collection(db, Collections.REPORTS), {
    reporterId: auth.uid,
    targetId: targetId.trim(),
    targetType,
    reason,
    note: typeof note === 'string' ? note.slice(0, 500) : '',
    status: 'pending',   // pending → reviewed → resolved/dismissed
    createdAt: serverTimestamp(),
  })

  return NextResponse.json({ ok: true })
}
