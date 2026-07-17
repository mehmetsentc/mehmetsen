/**
 * POST /api/newsletter/subscribe
 * Persists an email newsletter subscription with marketing consent.
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
  // Firestore doc ids can't contain `/`; emails are otherwise safe after normalize.
  return email.replace(/\//g, '_')
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(`newsletter:${ip}`, 8, 60_000)) {
    return rateLimitResponse()
  }

  let body: { email?: string; marketingConsent?: boolean }
  try {
    body = (await req.json()) as { email?: string; marketingConsent?: boolean }
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }

  const email = normalizeEmail(body.email ?? '')
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Geçerli bir e-posta adresi gerekli' }, { status: 400 })
  }

  if (body.marketingConsent !== true) {
    return NextResponse.json(
      { error: 'Bülten aboneliği için pazarlama izni gerekli' },
      { status: 400 }
    )
  }

  try {
    const db = getAdminFirestore()
    const ref = db.collection(Collections.NEWSLETTER_SUBSCRIBERS).doc(emailDocId(email))
    const existing = await ref.get()

    if (existing.exists && existing.data()?.status === 'active') {
      return NextResponse.json({ ok: true, message: 'Bu e-posta zaten kayıtlı', alreadySubscribed: true })
    }

    await ref.set(
      {
        email,
        status: 'active',
        marketingConsent: true,
        source: 'desktop-home',
        ipHash: ip === 'unknown' ? null : ip.slice(0, 64),
        subscribedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        unsubscribedAt: null,
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, message: 'Kayıt alındı' })
  } catch (err) {
    console.error('[newsletter/subscribe]', err instanceof Error ? err.message : 'failed')
    return NextResponse.json({ error: 'Kayıt şu an alınamadı' }, { status: 500 })
  }
}
