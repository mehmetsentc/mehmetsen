/**
 * GET  /api/admin/social/facebook-app — BYO app config (no secrets)
 * POST /api/admin/social/facebook-app — save app id/secret/name + optional page token
 * DELETE — clear site custom app
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  PRIMARY_FACEBOOK_SITE_ID,
  clearSiteFacebookApp,
  getFacebookAppsDoc,
  getSiteFacebookApp,
  toPublicSiteApp,
  upsertSiteFacebookApp,
} from '@/lib/social/facebookAppStore'
import { hasSecretEncryptionKey } from '@/lib/crypto/secretCrypto'
import { resolveFacebookCredentials } from '@/lib/social/facebookCredentials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const siteId =
    url.searchParams.get('siteId')?.trim().toLowerCase() || PRIMARY_FACEBOOK_SITE_ID

  const doc = await getFacebookAppsDoc(true)
  const stored = await getSiteFacebookApp(siteId)
  const publicSite = toPublicSiteApp(siteId, stored)
  const creds = await resolveFacebookCredentials(siteId)
  const siteEnvConfigured = Boolean(
    process.env[`${siteId.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_FB_APP_ID`]?.trim() &&
      process.env[`${siteId.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_FB_PAGE_ACCESS_TOKEN`]?.trim(),
  )

  const attributionBlocked =
    creds.mode === 'global'
      ? 'Şu an GLOBAL Meta App kullanılıyor — postlarda "NaHaber Social Publisher paylaştı" (veya Display Name) görünür. Kendi App’inizi bağlayın VEYA Meta Console’da Display Name’i "Onyeditivi Publisher" / "Publisher" yapın.'
      : `Özel app aktif (source=${creds.source}). Post altında "${creds.appName || 'App'} paylaştı" görünmeli.`

  return NextResponse.json({
    primarySiteId: doc.primarySiteId || PRIMARY_FACEBOOK_SITE_ID,
    site: publicSite,
    encryptionReady: hasSecretEncryptionKey(),
    activeMode: creds.mode,
    activeSource: creds.source,
    activeAppId: creds.appId,
    activeAppName: creds.appName,
    siteEnvConfigured,
    attributionBlocked,
    setupHint:
      creds.mode === 'global'
        ? 'Admin formuna App ID + Secret + Page Token kaydedin, veya Vercel env: ONYEDITIVI_FB_APP_ID, ONYEDITIVI_FB_APP_SECRET, ONYEDITIVI_FB_PAGE_ACCESS_TOKEN, ONYEDITIVI_FB_PAGE_ID.'
        : null,
    globalAppReminder:
      'Aynı App ID kullanıldığı sürece kod Display Name’i değiştiremez. Meta → developers.facebook.com/apps → Settings → Basic → Display Name: "Onyeditivi Publisher" veya "Publisher".',
    docsPath: '/docs/kendi-facebook-app-nasil-olusturulur',
  })
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    siteId?: string
    fbAppId?: string | null
    fbAppSecret?: string | null
    fbAppName?: string | null
    fbPageId?: string | null
    fbPageAccessToken?: string | null
    clearSecret?: boolean
    clearPageToken?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const siteId = (body.siteId?.trim() || PRIMARY_FACEBOOK_SITE_ID).toLowerCase()
  const fbAppId = body.fbAppId?.trim() || null
  const fbAppSecret = body.fbAppSecret?.trim() || null
  const fbAppName = body.fbAppName?.trim() || null

  if (!fbAppId && !body.clearSecret && !body.fbPageAccessToken) {
    // Allow updating name/token alone if app already exists
    const existing = await getSiteFacebookApp(siteId)
    if (!existing?.fbAppId?.trim() && !fbAppId) {
      return NextResponse.json({ error: 'fbAppId gerekli' }, { status: 400 })
    }
  }

  try {
    const site = await upsertSiteFacebookApp({
      siteId,
      fbAppId: body.fbAppId !== undefined ? fbAppId : undefined,
      fbAppSecret: fbAppSecret || undefined,
      fbAppName: body.fbAppName !== undefined ? fbAppName : undefined,
      fbPageId: body.fbPageId !== undefined ? body.fbPageId?.trim() || null : undefined,
      fbPageAccessToken: body.fbPageAccessToken?.trim() || undefined,
      clearSecret: body.clearSecret === true,
      clearPageToken: body.clearPageToken === true,
      updatedBy: auth.uid,
    })

    return NextResponse.json({
      ok: true,
      site,
      message: site.hasFbPageToken
        ? 'Özel Facebook App kaydedildi — paylaşımlar bu app ile atılacak.'
        : 'App kaydedildi. Page Access Token için OAuth ile bağlayın veya token yapıştırın.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[facebook-app] save failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const siteId =
    url.searchParams.get('siteId')?.trim().toLowerCase() || PRIMARY_FACEBOOK_SITE_ID

  await clearSiteFacebookApp(siteId, auth.uid)
  return NextResponse.json({ ok: true, message: `Özel app temizlendi: ${siteId}` })
}
