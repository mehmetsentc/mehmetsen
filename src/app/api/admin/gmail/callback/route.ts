/**
 * GET /api/admin/gmail/callback
 * OAuth 2.0 callback from Google. Exchanges code for tokens, verifies
 * the authorized account is GMAIL_MAILBOX, stores encrypted tokens.
 */
import { NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/gmail/oauth'
import { decrypt } from '@/lib/gmail/crypto'
import { saveTokens } from '@/services/gmailService'
import { getAdminFirestore, getAdminAuth } from '@/lib/firebase/admin'
import { isSuperAdminEmailServer, getBootstrapAdminUids } from '@/lib/cmsSecrets.server'

export const runtime = 'nodejs'

const EXPECTED_MAILBOX = process.env.GMAIL_MAILBOX ?? ''

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateB64 = searchParams.get('state')
  const error = searchParams.get('error')

  const adminUrl = `${new URL(request.url).origin}/admin/inbox`

  // User denied access
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

    // State must be < 10 minutes old
    if (!uid || !ts || Date.now() - ts > 10 * 60 * 1000) {
      return NextResponse.redirect(`${adminUrl}?error=invalid_state`)
    }

    // Verify the uid is a valid CMS user with system:settings permission.
    // Mirror the same precedence as verifyCmsToken in cmsAuthServer.ts.
    const authUser = await getAdminAuth().getUser(uid)
    const email = authUser.email ?? ''

    if (!isSuperAdminEmailServer(email) && !getBootstrapAdminUids().includes(uid)) {
      // Fall back to Firestore role document (field is 'role', not 'cmsRole')
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

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    // CRITICAL: Verify gmail.readonly scope was actually granted
    if (!tokens.scope.includes('gmail.readonly') && !tokens.scope.includes('https://www.googleapis.com/auth/gmail.readonly')) {
      return NextResponse.redirect(`${adminUrl}?error=missing_scope`)
    }

    // CRITICAL: Verify the authorized account matches GMAIL_MAILBOX
    if (!tokens.email) {
      return NextResponse.redirect(`${adminUrl}?error=no_email_in_token`)
    }
    if (tokens.email.toLowerCase() !== EXPECTED_MAILBOX.toLowerCase()) {
      return NextResponse.redirect(
        `${adminUrl}?error=wrong_account&expected=${encodeURIComponent(EXPECTED_MAILBOX)}&got=${encodeURIComponent(tokens.email)}`,
      )
    }

    // Save encrypted tokens to Firestore
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
    console.error('[gmail/callback]', err)
    return NextResponse.redirect(`${adminUrl}?error=callback_error`)
  }
}
