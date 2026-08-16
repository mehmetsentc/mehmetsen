/**
 * GET /api/admin/gmail/callback
 * OAuth 2.0 callback from Google. Exchanges code for tokens, verifies
 * the authorized account is GMAIL_MAILBOX, stores encrypted tokens.
 */
import { NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/gmail/oauth'
import { hasGmailModifyScope } from '@/lib/gmail/scopes'
import { decrypt } from '@/lib/gmail/crypto'
import { saveTokens } from '@/services/gmailService'
import { getAdminFirestore, getAdminAuth } from '@/lib/firebase/admin'
import { isSuperAdminEmailServer, getBootstrapAdminUids } from '@/lib/cmsSecrets.server'
import { CANONICAL_PRODUCTION_URL } from '@/lib/seo'

export const runtime = 'nodejs'

const EXPECTED_MAILBOX = process.env.GMAIL_MAILBOX ?? ''

/** Resolve admin inbox URL — always use canonical origin in production. */
function adminInboxUrl(requestUrl: string): string {
  try {
    const origin = new URL(requestUrl).origin
    const base = process.env.VERCEL_ENV === 'production' ? CANONICAL_PRODUCTION_URL : origin
    return `${base}/admin/inbox`
  } catch {
    return `${CANONICAL_PRODUCTION_URL}/admin/inbox`
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateB64 = searchParams.get('state')
  const error = searchParams.get('error')

  const adminUrl = adminInboxUrl(request.url)

  if (error) {
    return NextResponse.redirect(`${adminUrl}?error=${encodeURIComponent(error)}`)
  }
  if (!code || !stateB64) {
    return NextResponse.redirect(`${adminUrl}?error=missing_params`)
  }

  try {
    // Decode & decrypt state to verify CSRF and get connecting uid
    const stateStr = Buffer.from(stateB64, 'base64url').toString()
    const decrypted = await decrypt(stateStr)
    const [uid, tsStr] = decrypted.split(':')
    const ts = Number(tsStr)

    if (!uid || !ts || Date.now() - ts > 10 * 60 * 1000) {
      return NextResponse.redirect(`${adminUrl}?error=invalid_state`)
    }

    // Verify the uid is a valid CMS user with system:settings permission
    const authUser = await getAdminAuth().getUser(uid)
    const email = authUser.email ?? ''

    if (!isSuperAdminEmailServer(email) && !getBootstrapAdminUids().includes(uid)) {
      const db = getAdminFirestore()
      const userDoc = await db.collection('users').doc(uid).get()
      if (!userDoc.exists) {
        return NextResponse.redirect(`${adminUrl}?error=user_not_found`)
      }
      const userData = userDoc.data()!
      const role = (userData.role ?? '') as string
      if (!['super_admin', 'managing_editor'].includes(role) && !userData.permissions?.includes('system:settings')) {
        return NextResponse.redirect(`${adminUrl}?error=insufficient_role`)
      }
    }

    // Exchange code for tokens (throws INSUFFICIENT_SCOPE if read access missing)
    const tokens = await exchangeCodeForTokens(code)

    // gmail.modify is required to mark messages read (gmail.readonly cannot)
    if (!hasGmailModifyScope(tokens.scope)) {
      return NextResponse.redirect(`${adminUrl}?error=missing_scope`)
    }

    // Must have a refresh token — absent means prior grant exists without prompt=consent
    if (!tokens.refreshToken) {
      return NextResponse.redirect(`${adminUrl}?error=no_refresh_token`)
    }

    // Verify the authorized account matches GMAIL_MAILBOX
    if (!tokens.email) {
      return NextResponse.redirect(`${adminUrl}?error=no_email_in_token`)
    }
    if (tokens.email.toLowerCase() !== EXPECTED_MAILBOX.toLowerCase()) {
      return NextResponse.redirect(
        `${adminUrl}?error=wrong_account&got=${encodeURIComponent(tokens.email)}`,
      )
    }

    // Save both tokens encrypted to Firestore
    await saveTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      accountEmail: tokens.email,
      connectedBy: uid,
    })

    return NextResponse.redirect(`${adminUrl}?connected=1`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[gmail/callback] error:', msg.slice(0, 200))
    return NextResponse.redirect(`${adminUrl}?error=callback_error`)
  }
}
