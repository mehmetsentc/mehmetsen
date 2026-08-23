import { NextResponse } from 'next/server'
import {
  getFootballAccountStatus,
  CURRENT_SEASON,
} from '@/services/footballService.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Secret-free probe for API-Football wiring.
 * Skor is fully automatic (cron + API) — no AI involvement.
 */
export async function GET() {
  const status = await getFootballAccountStatus()
  return NextResponse.json(
    {
      ...status,
      season: CURRENT_SEASON,
      skorAutomatic: true,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
