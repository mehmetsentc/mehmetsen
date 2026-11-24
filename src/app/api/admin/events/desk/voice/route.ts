/**
 * EVENT-DESK-1 — POST /api/admin/events/desk/voice { eventId }
 * Etkinlik seslendirmesi örneği: metin sunucuda alanlardan kurulur (istemci metin gönderemez), ≤200 karakter.
 * Seslendirme kotasından düşer.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { synthesizeReelVoice } from '@/lib/reels/voice'
import { eventVoiceScript } from '@/lib/events/eventDesk'
import { eventVoiceFor } from '@/lib/events/eventVoice'
import { findDeskItem, loadDesk } from '@/lib/events/eventDeskStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:create')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 })
  }
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : ''
  const now = Date.now()
  const item = eventId ? findDeskItem((await loadDesk(now)).items, eventId) : null
  if (!item) return NextResponse.json({ error: 'Etkinlik bulunamadı' }, { status: 404 })
  const voice = await eventVoiceFor(item.citySlug)
  const text = eventVoiceScript(item, now)
  try {
    const wav = await synthesizeReelVoice(text, AbortSignal.timeout(20_000), { voice: voice.voice, rate: voice.rate })
    return NextResponse.json({ audio: `data:audio/wav;base64,${wav.toString('base64')}`, text, voice })
  } catch (err) {
    const quota = err instanceof Error && err.name === 'TtsQuotaError'
    return NextResponse.json({ error: quota ? 'Seslendirme kotası doldu' : 'Seslendirme üretilemedi' }, { status: quota ? 429 : 500 })
  }
}
