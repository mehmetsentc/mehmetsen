/**
 * GET /api/sports/transfermarkt?type=standings|squad|transfers
 *
 * R'daki: GET isteği → JSON response
 * type=standings  → Süper Lig puan tablosu
 * type=squad      → ?club_id=141 tek kulüp kadrosu
 * type=transfers  → Son transferler
 */
import { NextResponse } from 'next/server'
import { superLigTablosu, klubKadrosu, sonTransferler } from '@/lib/sports/transfermarkt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type    = searchParams.get('type')    ?? 'standings'
  const clubId  = searchParams.get('club_id') ?? '141'
  const season  = searchParams.get('season')  ?? '2024'

  // if/else zinciri — R'daki switch/case
  if (type === 'standings') {
    const data = await superLigTablosu(season)
    return NextResponse.json({ data }, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' }
    })
  }

  if (type === 'squad') {
    const data = await klubKadrosu(clubId, season)
    return NextResponse.json({ data }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' }
    })
  }

  if (type === 'transfers') {
    const data = await sonTransferler(season)
    return NextResponse.json({ data }, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' }
    })
  }

  return NextResponse.json({ error: 'Geçersiz type' }, { status: 400 })
}
