/**
 * GET /api/eczane?il=istanbul
 *
 * Eczaneler.ORG API'yi proxy'ler.
 * ECZANELER_API_KEY env yoksa 503 döner (özellik devre dışı).
 * 10 dakika Vercel Edge Cache ile önbelleğe alınır.
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ECZANELER_BASE = 'https://eczaneler.org/api'

export async function GET(request: Request) {
  const apiKey = process.env.ECZANELER_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Eczane servisi şu an aktif değil' },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(request.url)
  const il = searchParams.get('il')?.toLowerCase().trim()
  const page = searchParams.get('page') ?? '1'

  if (!il) {
    return NextResponse.json({ error: 'il parametresi gerekli' }, { status: 400 })
  }

  const url = `${ECZANELER_BASE}/pharmacies/sentry-city-list/${encodeURIComponent(il)}/${page}`

  try {
    const res = await fetch(url, {
      headers: { 'X-Api-Key': apiKey },
      signal: AbortSignal.timeout(8_000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Eczane servisi hatası: ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()

    return NextResponse.json(data, {
      headers: {
        // 10 dakika cache — Eczaneler.ORG zaten 10dk cache kullanıyor
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300',
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Bağlantı hatası' },
      { status: 500 }
    )
  }
}
