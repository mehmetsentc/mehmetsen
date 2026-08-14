/**
 * GET /api/admin/gmail/status
 * Returns whether Gmail is connected, account info, and INBOX unread counts.
 * Requires: news:read permission
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getInboxBadgeCounts, getIntegration } from '@/services/gmailService'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const user = await verifyCmsToken(request, 'news:read')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const integration = await getIntegration()
    if (!integration) {
      return NextResponse.json({
        connected: false,
        messagesUnread: 0,
        messagesTotal: 0,
      })
    }

    const badge = await getInboxBadgeCounts()
    return NextResponse.json({
      connected: true,
      accountEmail: integration.accountEmail,
      connectedAt: integration.connectedAt,
      connectedBy: integration.connectedBy,
      messagesUnread: badge.messagesUnread,
      messagesTotal: badge.messagesTotal,
    })
  } catch (err) {
    console.error('[gmail/status]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
