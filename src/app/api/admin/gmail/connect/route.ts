/**
 * GET /api/admin/gmail/connect
 * Builds the Google OAuth consent URL and returns it as JSON.
 * The client performs the redirect (fetch + auth header can't follow cross-origin redirects).
 * Requires: system:settings permission
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { buildAuthUrl, isGmailOAuthConfigured, isGmailEncryptionConfigured } from '@/lib/gmail/oauth'
import { encrypt } from '@/lib/gmail/crypto'
import { GmailError } from '@/lib/gmail/errors'
import { gmailJsonError } from '@/lib/gmail/http'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const user = await verifyCmsToken(request, 'system:settings')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    if (!isGmailEncryptionConfigured()) {
      throw new GmailError('CONFIGURATION_ERROR', { detail: 'missing_encryption_key' })
    }
    if (!isGmailOAuthConfigured()) {
      throw new GmailError('CONFIGURATION_ERROR', { detail: 'missing_client_or_redirect' })
    }

    // CSRF state: encrypt "uid:timestamp" so we can verify on callback
    const statePayload = `${user.uid}:${Date.now()}`
    const state = await encrypt(statePayload)
    const encodedState = Buffer.from(state).toString('base64url')

    const authUrl = buildAuthUrl(encodedState)
    return NextResponse.json({ authUrl })
  } catch (err) {
    return gmailJsonError(err)
  }
}
