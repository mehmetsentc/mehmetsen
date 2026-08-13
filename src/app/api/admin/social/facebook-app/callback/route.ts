/**
 * GET /api/admin/social/facebook-app/callback
 * Facebook OAuth redirect — exchanges code, stores Page token for custom app.
 */
import { NextResponse } from 'next/server'
import {
  PRIMARY_FACEBOOK_SITE_ID,
  getDecryptedAppSecret,
  getSiteFacebookApp,
  upsertSiteFacebookApp,
} from '@/lib/social/facebookAppStore'
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchPageAccessToken,
  parseFacebookOAuthState,
} from '@/lib/social/facebookOAuth'
import { getSiteUrl } from '@/lib/seo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function redirectAdmin(query: Record<string, string>): NextResponse {
  const base = getSiteUrl()
  const q = new URLSearchParams(query)
  return NextResponse.redirect(`${base}/admin/social?${q.toString()}`)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')?.trim() || ''
  const state = url.searchParams.get('state')?.trim() || ''
  const oauthError = url.searchParams.get('error')?.trim()
  const oauthErrorDesc = url.searchParams.get('error_description')?.trim()

  if (oauthError) {
    return redirectAdmin({
      fbApp: 'error',
      message: oauthErrorDesc || oauthError,
    })
  }

  if (!code || !state) {
    return redirectAdmin({ fbApp: 'error', message: 'OAuth code/state eksik' })
  }

  const parsed = await parseFacebookOAuthState(state)
  if (!parsed) {
    return redirectAdmin({ fbApp: 'error', message: 'OAuth state geçersiz veya süresi dolmuş' })
  }

  const siteId = parsed.siteId || PRIMARY_FACEBOOK_SITE_ID
  const stored = await getSiteFacebookApp(siteId)
  const appId = stored?.fbAppId?.trim()
  const appSecret = await getDecryptedAppSecret(siteId)

  if (!appId || !appSecret) {
    return redirectAdmin({
      fbApp: 'error',
      message: 'Site App ID/Secret bulunamadı',
      siteId,
    })
  }

  try {
    const shortLived = await exchangeCodeForUserToken({
      appId,
      appSecret,
      code,
    })
    const longLived = await exchangeForLongLivedUserToken({
      appId,
      appSecret,
      shortLivedToken: shortLived,
    })

    const preferredPageId =
      stored?.fbPageId?.trim() || process.env.FACEBOOK_PAGE_ID?.trim() || null

    const page = await fetchPageAccessToken({
      userToken: longLived,
      preferredPageId,
    })

    await upsertSiteFacebookApp({
      siteId,
      fbPageId: page.pageId,
      fbPageAccessToken: page.accessToken,
      updatedBy: parsed.uid,
    })

    console.log(
      `[facebook-app/callback] page token saved site=${siteId} page=${page.pageName} id=${page.pageId}`,
    )

    return redirectAdmin({
      fbApp: 'ok',
      siteId,
      pageName: page.pageName,
      pageId: page.pageId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[facebook-app/callback] failed:', msg)
    return redirectAdmin({ fbApp: 'error', message: msg, siteId })
  }
}
