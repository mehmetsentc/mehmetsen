import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface OnThisDayEvent {
  year: number
  text: string
  link?: string
}

interface StoredDoc {
  events?: OnThisDayEvent[]
  fetchedAt?: number
}

interface WikiResponse {
  events?: Array<{
    year: number
    text: string
    pages?: Array<{
      content_urls?: { desktop?: { page?: string } }
    }>
  }>
}

async function getStoredEvents(month: number, day: number): Promise<OnThisDayEvent[] | null> {
  const docId = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const db = getAdminFirestore()
  const doc = await db.collection('onThisDayEvents').doc(docId).get()
  if (!doc.exists) return null
  const data = doc.data() as StoredDoc
  return data?.events?.length ? data.events : null
}

async function fetchAndStoreEvents(month: number, day: number): Promise<OnThisDayEvent[]> {
  const url = `https://tr.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'nahaber.com/1.0 (contact: mehmetsentc@gmail.com)' },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) throw new Error(`Wikipedia API ${res.status}`)
  const data: WikiResponse = await res.json()
  const raw = data.events ?? []

  const events: OnThisDayEvent[] = raw
    .sort((a, b) => a.year - b.year)
    .slice(0, 10)
    .map((e) => ({
      year: e.year,
      text: e.text,
      link: e.pages?.[0]?.content_urls?.desktop?.page,
    }))

  // Firestore'a yaz (sonraki istekler için cache)
  const docId = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  try {
    const db = getAdminFirestore()
    await db.collection('onThisDayEvents').doc(docId).set({
      month,
      day,
      fetchedAt: Date.now(),
      events,
    })
  } catch {
    // cache yazma hatası kritik değil
  }

  return events
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
  const day = Number(searchParams.get('day') || new Date().getDate())
  const limit = Math.min(Number(searchParams.get('limit') || 5), 10)

  try {
    // 1) Önce Firestore cache'e bak
    let events = await getStoredEvents(month, day)

    // 2) Cache boşsa Wikipedia'dan doğrudan çek
    if (!events || events.length === 0) {
      events = await fetchAndStoreEvents(month, day)
    }

    return NextResponse.json(
      { events: (events ?? []).slice(0, limit) },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
    )
  } catch (err) {
    console.error('[api/news/on-this-day]', err)
    return NextResponse.json({ events: [] })
  }
}
