import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string }
    const email = body.email?.trim().toLowerCase()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Geçerli bir e-posta adresi gerekli' }, { status: 400 })
    }

    // Stub: log intent; production would persist to Firestore / mailing provider
    console.info('[newsletter/subscribe]', email)

    return NextResponse.json({ ok: true, message: 'Kayıt alındı' })
  } catch {
    return NextResponse.json({ error: 'İstek işlenemedi' }, { status: 400 })
  }
}
