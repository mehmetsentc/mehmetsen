/**
 * Resolve Facebook publish credentials: custom (BYO) site app vs global NaHaber app.
 *
 * Priority:
 *   1. Firestore config/socialFacebookApps (onyeditivi) — App ID + encrypted page token
 *   2. Env ONYEDITIVI_FB_APP_ID + ONYEDITIVI_FB_PAGE_ACCESS_TOKEN (+ optional secret/name/pageId)
 *   3. Global FACEBOOK_PAGE_* / config/socialMedia → attribution = Meta App Display Name
 *
 * Attribution label ("X paylaştı") is Meta App Display Name for the App that issued
 * the page token. Code cannot rename it while the same App ID is used.
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
  /** firestore | env | global */
  source: 'firestore' | 'env' | 'global'
}

function envSiteKey(siteId: string, suffix: string): string {
  // onyeditivi → ONYEDITIVI_FB_APP_ID
  const prefix = siteId.replace(/[^a-z0-9]+/gi, '_').toUpperCase()
  return `${prefix}_FB_${suffix}`
}

function readSiteEnv(siteId: string): {
  appId: string
  appSecret: string
  appName: string
  pageId: string
  pageToken: string
} {
  const g = (suffix: string) => process.env[envSiteKey(siteId, suffix)]?.trim() || ''
  return {
    appId: g('APP_ID'),
    appSecret: g('APP_SECRET'),
    appName: g('APP_NAME'),
    pageId: g('PAGE_ID'),
    pageToken: g('PAGE_ACCESS_TOKEN'),
  }
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
    if (customToken) {
      const pageId =
        pageIdOverride ||
        process.env.FACEBOOK_PAGE_ID?.trim() ||
        ''
      if (pageId) {
        console.log(
          `[facebook] custom app kullanıldı source=firestore site=${id} app_id=${fbAppId} appName=${fbAppName ?? '?'} hasSecret=${Boolean(secret)}`,
        )
        return {
          mode: 'custom',
          siteId: id,
          pageId,
          accessToken: customToken,
          appId: fbAppId,
          appName: fbAppName,
          source: 'firestore',
        }
      }
      console.warn(
        `[facebook] custom app configured but pageId missing site=${id} — falling back`,
      )
    } else {
      console.warn(
        `[facebook] custom app incomplete site=${id} hasSecret=${Boolean(secret)} hasToken=false — falling back`,
      )
    }
  }

  const siteEnv = readSiteEnv(id)
  if (siteEnv.appId && siteEnv.pageToken) {
    const pageId =
      siteEnv.pageId ||
      process.env.FACEBOOK_PAGE_ID?.trim() ||
      ''
    if (pageId) {
      const appName = siteEnv.appName || 'Onyeditivi Publisher'
      console.log(
        `[facebook] custom app kullanıldı source=env site=${id} app_id=${siteEnv.appId} appName=${appName} hasSecret=${Boolean(siteEnv.appSecret)}`,
      )
      return {
        mode: 'custom',
        siteId: id,
        pageId,
        accessToken: siteEnv.pageToken,
        appId: siteEnv.appId,
        appName,
        source: 'env',
      }
    }
    console.warn(
      `[facebook] ONYEDITIVI_FB_* set but pageId missing site=${id} — falling back to global`,
    )
  }

  const pageId = process.env.FACEBOOK_PAGE_ID?.trim() || ''
  const { fbToken } = await getSocialTokens()
  const globalAppId =
    process.env.FACEBOOK_APP_ID?.trim() ||
    process.env.NEXT_PUBLIC_FACEBOOK_APP_ID?.trim() ||
    null

  console.log(
    `[facebook] global app kullanıldı source=global site=${id} app_id=${globalAppId ?? 'env-token-only'} — attribution = Meta Display Name (NaHaber Social Publisher if unchanged)`,
  )

  return {
    mode: 'global',
    siteId: id,
    pageId,
    accessToken: fbToken,
    appId: globalAppId,
    appName: 'Publisher',
    source: 'global',
  }
}
