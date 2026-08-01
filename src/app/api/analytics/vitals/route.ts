import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// COST PAUSE: Firestore vitals writes disabled to reduce costs.
// To restore: bring back the original implementation from git history.
export async function POST() {
  return NextResponse.json({ ok: true, skipped: 'cost-pause' })
}
