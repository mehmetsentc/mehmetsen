/**
 * Resolve Facebook publish credentials: custom (BYO) site app vs global NaHaber app.
 *
 * Custom path requires: fbAppId + decrypted secret + page token for that app.
 * Otherwise falls back to FACEBOOK_* env / config/socialMedia and logs
 * "global app kullanıldı".
 */
import 'server-only'
import { getSocialTokens } from './tokenStore'
import {
  PRIMARY_FACEBOOK_SITE_ID,
  getDecryptedAppSecret,
  getDecryptedPageToken,
  getSiteFacebookApp,
} from './facebookAppStore'

export type FacebookCredentialMode = 'custom' | 'global'

export interface FacebookPublishCredentials {
  mode: FacebookCredentialMode
  siteId: string
  pageId: string
  accessToken: string
  appId: string | null
  appName: string | null
}

export async function resolveFacebookCredentials(
  siteId: string = PRIMARY_FACEBOOK_SITE_ID,
): Promise<FacebookPublishCredentials> {
  const id = (siteId.trim() || PRIMARY_FACEBOOK_SITE_ID).toLowerCase()
  const stored = await getSiteFacebookApp(id)
  const fbAppId = stored?.fbAppId?.trim() || ''
  const fbAppName = stored?.fbAppName?.trim() || null
  const pageIdOverride = stored?.fbPageId?.trim() || ''

  if (fbAppId) {
    const secret = await getDecryptedAppSecret(id)
    const customToken = await getDecryptedPageToken(id)
    if (secret && customToken) {
      const pageId = pageIdOverride || process.env.FACEBOOK_PAGE_ID?.trim() || ''
      if (pageId) {
        console.log(
          `[facebook] custom app kullanıldı site=${id} appId=${fbAppId} appName=${fbAppName ?? '?'}`,
        )
        return {
          mode: 'custom',
          siteId: id,
          pageId,
          accessToken: customToken,
          appId: fbAppId,
          appName: fbAppName,
        }
      }
      console.warn(
        `[facebook] custom app configured but pageId missing site=${id} — falling back to global`,
      )
    } else {
      console.warn(
        `[facebook] custom app incomplete site=${id} hasSecret=${Boolean(secret)} hasToken=${Boolean(customToken)} — falling back to global`,
      )
    }
  }

  const pageId = process.env.FACEBOOK_PAGE_ID?.trim() || ''
  const { fbToken } = await getSocialTokens()
  const globalAppId =
    process.env.FACEBOOK_APP_ID?.trim() ||
    process.env.NEXT_PUBLIC_FACEBOOK_APP_ID?.trim() ||
    null

  console.log(
    `[facebook] global app kullanıldı site=${id} appId=${globalAppId ?? 'env-token-only'}`,
  )

  return {
    mode: 'global',
    siteId: id,
    pageId,
    accessToken: fbToken,
    appId: globalAppId,
    appName: 'Publisher',
  }
}
