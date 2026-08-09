/**
 * Diagnostic: same as /api/city-check but on Node.js runtime.
 * Verifies whether host headers differ between Edge and Node.js.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const h = await headers()
  return NextResponse.json({
    'req.host': request.headers.get('host') ?? '(null)',
    'req.x-forwarded-host': request.headers.get('x-forwarded-host') ?? '(null)',
    'headers().host': h.get('host') ?? '(null)',
    'headers().x-forwarded-host': h.get('x-forwarded-host') ?? '(null)',
    CITY_NETWORK_ENABLED: process.env.CITY_NETWORK_ENABLED ?? '(not set)',
    runtime: 'nodejs',
  })
}
