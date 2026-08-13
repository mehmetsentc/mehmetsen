/**
 * GET /api/admin/social/facebook-app/oauth?siteId=onyeditivi
 * Starts Facebook Login OAuth using the site's custom App ID.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  PRIMARY_FACEBOOK_SITE_ID,
  getDecryptedAppSecret,
  getSiteFacebookApp,
} from '@/lib/social/facebookAppStore'
import {
  buildFacebookLoginUrl,
  buildFacebookOAuthState,
} from '@/lib/social/facebookOAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const siteId =
    url.searchParams.get('siteId')?.trim().toLowerCase() || PRIMARY_FACEBOOK_SITE_ID

  const stored = await getSiteFacebookApp(siteId)
  const appId = stored?.fbAppId?.trim()
  if (!appId) {
    return NextResponse.json(
      { error: 'Önce App ID / Secret kaydedin' },
      { status: 400 },
    )
  }

  const secret = await getDecryptedAppSecret(siteId)
  if (!secret) {
    return NextResponse.json(
      { error: 'App Secret eksik veya çözülemedi' },
      { status: 400 },
    )
  }

  const state = await buildFacebookOAuthState({ siteId, uid: auth.uid })
  const oauthUrl = buildFacebookLoginUrl(appId, state)

  return NextResponse.json({
    ok: true,
    siteId,
    appId,
    oauthUrl,
    redirectUriNote:
      'Facebook App → Facebook Login → Valid OAuth Redirect URIs listesine callback URL ekleyin.',
  })
}
