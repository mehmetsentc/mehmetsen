/**
 * BYO Facebook App doğrulama — onyeditivi custom app mi, global mi?
 *
 * Usage:
 *   npx tsx scripts/test-facebook-byo-app.ts
 *   npx tsx scripts/test-facebook-byo-app.ts <newsId>
 *   npm run test:facebook-byo -- <newsId>
 *
 * Secrets asla loglanmaz. Attribution: post altında custom Display Name görünmeli.
 */
import {
  PRIMARY_FACEBOOK_SITE_ID,
  getSiteFacebookApp,
  toPublicSiteApp,
} from '../src/lib/social/facebookAppStore'
import { resolveFacebookCredentials } from '../src/lib/social/facebookCredentials'
import { testFacebookPost } from '../src/lib/social/facebook'

async function main() {
  const newsId = process.argv[2]?.trim()
  const siteId = PRIMARY_FACEBOOK_SITE_ID

  console.log(`[test-facebook-byo] site=${siteId}`)

  const stored = await getSiteFacebookApp(siteId)
  const pub = toPublicSiteApp(siteId, stored)
  console.log('[test-facebook-byo] config (no secrets):', JSON.stringify(pub, null, 2))

  const creds = await resolveFacebookCredentials(siteId)
  console.log('[test-facebook-byo] credentials mode:', {
    mode: creds.mode,
    siteId: creds.siteId,
    pageId: creds.pageId ? `${creds.pageId.slice(0, 6)}…` : null,
    appId: creds.appId,
    appName: creds.appName,
    hasToken: Boolean(creds.accessToken),
  })

  if (creds.mode === 'global') {
    console.log(
      '[test-facebook-byo] UYARI: global app kullanıldı. Admin → Sosyal Medya → Kendi Facebook App bağlayın.',
    )
    console.log(
      '[test-facebook-byo] Attribution doğrulama: Facebook Developer Console’da Display Name’i "Publisher" yapın.',
    )
  } else {
    console.log(
      `[test-facebook-byo] Custom app aktif. Post altında "${creds.appName || 'App'} paylaştı" beklenir.`,
    )
  }

  if (!newsId) {
    console.log('[test-facebook-byo] Haber ID verilmedi — yalnızca credential kontrolü yapıldı.')
    console.log('Paylaşım testi: npx tsx scripts/test-facebook-byo-app.ts <newsId>')
    process.exit(creds.mode === 'custom' && creds.accessToken ? 0 : 2)
  }

  const result = await testFacebookPost(newsId)
  console.log(
    JSON.stringify(
      {
        success: result.success,
        platformId: result.platformId,
        error: result.error,
        credentialMode: result.credentialMode,
        appName: result.appName,
        appId: result.appId,
        attributionHint: result.attributionHint,
      },
      null,
      2,
    ),
  )
  process.exit(result.success ? 0 : 1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
