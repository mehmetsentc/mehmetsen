import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { CONTACT_FORM_SUBJECTS } from '@/constants/siteLegalLinks'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_SUBJECTS = new Set(CONTACT_FORM_SUBJECTS.map((s) => s.value))
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (!checkRateLimit(`contact:${ip}`, 5, 60 * 60_000)) {
    return rateLimitResponse()
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  }

  const { name, email, subject, message, website } = body as {
    name?: unknown
    email?: unknown
    subject?: unknown
    message?: unknown
    website?: unknown
  }

  if (typeof website === 'string' && website.trim()) {
    return NextResponse.json({ ok: true })
  }

  const trimmedName = typeof name === 'string' ? name.trim() : ''
  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const trimmedSubject = typeof subject === 'string' ? subject.trim() : 'genel'
  const trimmedMessage = typeof message === 'string' ? message.trim() : ''

  if (trimmedName.length < 2 || trimmedName.length > 120) {
    return NextResponse.json({ error: 'Geçerli bir ad girin.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(trimmedEmail) || trimmedEmail.length > 200) {
    return NextResponse.json({ error: 'Geçerli bir e-posta adresi girin.' }, { status: 400 })
  }
  if (!VALID_SUBJECTS.has(trimmedSubject as (typeof CONTACT_FORM_SUBJECTS)[number]['value'])) {
    return NextResponse.json({ error: 'Geçersiz konu seçimi.' }, { status: 400 })
  }
  if (trimmedMessage.length < 10 || trimmedMessage.length > 4000) {
    return NextResponse.json({ error: 'Mesajınız en az 10, en fazla 4000 karakter olmalıdır.' }, { status: 400 })
  }

  try {
    const db = getAdminFirestore()
    await db.collection(Collections.CONTACT_SUBMISSIONS).add({
      name: trimmedName,
      email: trimmedEmail,
      subject: trimmedSubject,
      message: trimmedMessage,
      status: 'new',
      ip,
      userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? '',
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch {
    return NextResponse.json({ error: 'Mesaj kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
