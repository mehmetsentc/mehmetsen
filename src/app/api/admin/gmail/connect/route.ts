/**
 * GET /api/admin/gmail/connect
 * Builds the Google OAuth consent URL and redirects the user there.
 * Requires: system:settings permission
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { buildAuthUrl } from '@/lib/gmail/oauth'
import { encrypt } from '@/lib/gmail/crypto'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const user = await verifyCmsToken(request, 'system:settings')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // CSRF state: encrypt "uid:timestamp" so we can verify on callback
    const statePayload = `${user.uid}:${Date.now()}`
    const state = await encrypt(statePayload)
    const encodedState = Buffer.from(state).toString('base64url')

    const authUrl = buildAuthUrl(encodedState)
    return NextResponse.redirect(authUrl)
  } catch (err) {
    console.error('[gmail/connect]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
