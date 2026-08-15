/**
 * GET /api/admin/gmail/status
 * Returns whether Gmail is connected, account info, and INBOX unread counts.
 * Requires: news:read permission
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getInboxBadgeCounts, getIntegration } from '@/services/gmailService'
import { isGmailOAuthConfigured, isGmailEncryptionConfigured } from '@/lib/gmail/oauth'
import { gmailJsonError } from '@/lib/gmail/http'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const user = await verifyCmsToken(request, 'news:read')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Surface config missing as a distinct state (not 500)
  if (!isGmailEncryptionConfigured() || !isGmailOAuthConfigured()) {
    return NextResponse.json({ connected: false, misconfigured: true })
  }

  try {
    const integration = await getIntegration()
    if (!integration) {
      return NextResponse.json({ connected: false, messagesUnread: 0, messagesTotal: 0 })
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
    return gmailJsonError(err)
  }
}
