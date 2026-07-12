import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const revalidate = 3600

interface OnThisDayEvent {
  year: number
  text: string
  link?: string
}

interface StoredDoc {
  events?: OnThisDayEvent[]
  fetchedAt?: number
}

async function getStoredEvents(month: number, day: number): Promise<OnThisDayEvent[] | null> {
  const docId = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const db = getAdminFirestore()
  const doc = await db.collection('onThisDayEvents').doc(docId).get()
  if (!doc.exists) return null
  const data = doc.data() as StoredDoc
  return data?.events ?? null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
  const day = Number(searchParams.get('day') || new Date().getDate())
  const limit = Math.min(Number(searchParams.get('limit') || 5), 10)

  try {
    const events = await getStoredEvents(month, day)
    return NextResponse.json(
      { events: (events ?? []).slice(0, limit) },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
    )
  } catch (err) {
    console.error('[api/news/on-this-day]', err)
    return NextResponse.json({ events: [] })
  }
}
