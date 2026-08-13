/**
 * POST /api/newsletter/unsubscribe
 * Public self-service unsubscribe (KVKK).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function emailDocId(email: string): string {
  return email.replace(/\//g, '_')
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(`newsletter-unsub:${ip}`, 8, 60_000)) {
    return rateLimitResponse()
  }

  let body: { email?: string }
  try {
    body = (await req.json()) as { email?: string }
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }

  const email = normalizeEmail(body.email ?? '')
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Geçerli bir e-posta adresi gerekli' }, { status: 400 })
  }

  try {
    const db = getAdminFirestore()
    const ref = db.collection(Collections.NEWSLETTER_SUBSCRIBERS).doc(emailDocId(email))
    const existing = await ref.get()

    if (!existing.exists) {
      // Do not leak whether email was on the list
      return NextResponse.json({ ok: true, message: 'Abonelik iptal edildi' })
    }

    await ref.set(
      {
        status: 'unsubscribed',
        marketingConsent: false,
        unsubscribedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, message: 'Abonelik iptal edildi' })
  } catch (err) {
    console.error('[newsletter/unsubscribe]', err instanceof Error ? err.message : 'failed')
    return NextResponse.json({ error: 'İşlem şu an tamamlanamadı' }, { status: 500 })
  }
}
