/**
 * GET /api/admin/gmail/status
 * Returns whether Gmail is connected and which account.
 * Requires: news:read permission
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getIntegration } from '@/services/gmailService'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const user = await verifyCmsToken(request, 'news:read')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const integration = await getIntegration()
    if (!integration) {
      return NextResponse.json({ connected: false })
    }
    return NextResponse.json({
      connected: true,
      accountEmail: integration.accountEmail,
      connectedAt: integration.connectedAt,
      connectedBy: integration.connectedBy,
    })
  } catch (err) {
    console.error('[gmail/status]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
