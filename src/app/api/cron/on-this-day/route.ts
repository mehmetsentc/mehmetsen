import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET?.trim()

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${CRON_SECRET}`) return true
  const url = new URL(req.url)
  const q = url.searchParams.get('secret') || url.searchParams.get('cron_secret')
  return q === CRON_SECRET
}

interface WikiEvent {
  year: number
  text: string
  link?: string
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

async function fetchWikipediaEvents(month: number, day: number): Promise<WikiEvent[]> {
  const url = `https://tr.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'nahaber.com/1.0 (contact: mehmetsentc@gmail.com)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Wikipedia API ${res.status}`)
  const data: WikiResponse = await res.json()
  const events = data.events ?? []

  // En eski 10 olayı al (daha dramatik/önemli genellikle)
  return events
    .sort((a, b) => a.year - b.year)
    .slice(0, 10)
    .map((e) => ({
      year: e.year,
      text: e.text,
      link: e.pages?.[0]?.content_urls?.desktop?.page,
    }))
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const docId = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  try {
    const events = await fetchWikipediaEvents(month, day)
    const db = getAdminFirestore()
    await db.collection('onThisDayEvents').doc(docId).set({
      month,
      day,
      fetchedAt: Date.now(),
      events,
    })

    return NextResponse.json({ ok: true, docId, count: events.length })
  } catch (err) {
    console.error('[cron/on-this-day]', err)
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}

export const POST = GET
