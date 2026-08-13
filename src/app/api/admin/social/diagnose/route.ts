/**
 * GET /api/admin/social/diagnose
 *
 * Facebook & Instagram token / permission / image URL teşhis aracı.
 * Admin panelinden tetiklenir — paylaşım neden çalışmıyor bunu gösterir.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GRAPH = 'https://graph.facebook.com/v21.0'

interface DiagStep {
  name: string
  ok: boolean
  detail: string
}

async function graphGet(path: string, token: string): Promise<{ ok: boolean; data: unknown; status: number }> {
  try {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetch(`${GRAPH}${path}${sep}access_token=${token}`)
    const data = await res.json()
    return { ok: res.ok, data, status: res.status }
  } catch (e) {
    return { ok: false, data: { error: String(e) }, status: 0 }
  }
}

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const steps: DiagStep[] = []
  const envFbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ?? ''
  let pageId = process.env.FACEBOOK_PAGE_ID?.trim() ?? ''
  const igBizId    = process.env.INSTAGRAM_BUSINESS_ID?.trim() ?? ''

  // ── 0. Firestore token kontrolü (cron'un gerçekte kullandığı token) ───────
  let fsFbToken = ''
  let fsIgToken = ''
  let fsTokenSource = 'env'
  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const db = getAdminFirestore()
    const doc = await db.collection('config').doc('socialMedia').get()
    const d = doc.data() ?? {}
    fsFbToken = (d.facebookPageToken as string | undefined)?.trim() ?? ''
    fsIgToken = (d.instagramToken    as string | undefined)?.trim() ?? ''
    if (fsFbToken) fsTokenSource = 'firestore'
  } catch (e) {
    steps.push({ name: 'Firestore Token Okuma', ok: false, detail: `Firestore erişim hatası: ${String(e)}` })
  }

  // Cron'un kullandığı gerçek token (BYO custom → Firestore socialMedia → env)
  let fbToken = fsFbToken || envFbToken
  let igToken = fsIgToken || process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || fbToken
  let byoMode = 'global'
  let byoAppId = ''
  let byoAppSecret = ''
  try {
    const { resolveFacebookCredentials } = await import('@/lib/social/facebookCredentials')
    const {
      toPublicSiteApp,
      getSiteFacebookApp,
      getDecryptedAppSecret,
      PRIMARY_FACEBOOK_SITE_ID,
    } = await import('@/lib/social/facebookAppStore')
    const siteId = PRIMARY_FACEBOOK_SITE_ID
    const stored = await getSiteFacebookApp(siteId)
    const pub = toPublicSiteApp(siteId, stored)
    const creds = await resolveFacebookCredentials(siteId)
    byoMode = creds.mode
    if (creds.mode === 'custom' && creds.accessToken) {
      fbToken = creds.accessToken
      if (creds.pageId) pageId = creds.pageId
      byoAppId = creds.appId ?? ''
      byoAppSecret = (await getDecryptedAppSecret(siteId)) ?? ''
    }
    steps.push({
      name: 'BYO Facebook App (onyeditivi)',
      ok: creds.mode === 'custom',
      detail: [
        `mode=${creds.mode}`,
        `appId=${creds.appId ?? '—'}`,
        `appName=${creds.appName ?? '—'}`,
        `hasSecret=${pub.hasFbAppSecret}`,
        `hasPageToken=${pub.hasFbPageToken}`,
        creds.mode === 'global'
          ? '⚠️ global app kullanıldı — Admin’de kendi App’inizi bağlayın'
          : '✓ özel app credentials aktif',
        'Display Name: Meta Console’da “Publisher” olmalı (kodla değişmez)',
      ].join(' | '),
    })
  } catch (e) {
    steps.push({
      name: 'BYO Facebook App (onyeditivi)',
      ok: false,
      detail: `Okunamadı: ${String(e)}`,
    })
  }

  steps.push({
    name: 'Token Kaynağı',
    ok: !!(fbToken && pageId && igBizId),
    detail: [
      `Kaynak: ${byoMode === 'custom' ? '✓ BYO custom app' : fsTokenSource === 'firestore' ? '⚠️ Firestore (env\'i override ediyor)' : '✓ Env var'}`,
      `FACEBOOK_PAGE_ACCESS_TOKEN (env): ${envFbToken ? `${envFbToken.length} karakter` : '✗ EKSİK'}`,
      `Firestore facebookPageToken: ${fsFbToken ? `${fsFbToken.length} karakter` : 'boş'}`,
      `Aktif token: ${fbToken ? `✓ (${fbToken.length} karakter, kaynak: ${byoMode === 'custom' ? 'byo' : fsTokenSource})` : '✗ YOK'}`,
      `FACEBOOK_PAGE_ID: ${pageId ? `✓ ${pageId}` : '✗ EKSİK'}`,
      `INSTAGRAM_BUSINESS_ID: ${igBizId ? `✓ ${igBizId}` : '✗ EKSİK'}`,
    ].join(' | '),
  })

  if (!fbToken) {
    return NextResponse.json({ steps, summary: 'Facebook token bulunamadı — Firestore veya Vercel env ayarlayın.' })
  }

  // ── 2. Token geçerliliği (/me) ────────────────────────────────────────────
  const meRes = await graphGet('/me', fbToken)
  const meData = meRes.data as { name?: string; id?: string; error?: { message?: string; code?: number } }
  steps.push({
    name: 'Token Geçerliliği (/me)',
    ok: meRes.ok && !meData.error,
    detail: meData.error
      ? `❌ ${meData.error.message} (code: ${meData.error.code})`
      : `✓ ${meData.name ?? '?'} (id: ${meData.id})`,
  })

  // ── 3. Token tipi / süre (/debug_token) ───────────────────────────────────
  // App access token (app_id|app_secret) preferred — page token as access_token
  // often works for expiry/type but scopes may be incomplete.
  const appId =
    byoAppId ||
    process.env.FACEBOOK_APP_ID?.trim() ||
    process.env.NEXT_PUBLIC_FACEBOOK_APP_ID?.trim() ||
    ''
  const appSecret = byoAppSecret || process.env.FACEBOOK_APP_SECRET?.trim() || ''
  const debugAccessToken = appId && appSecret ? `${appId}|${appSecret}` : fbToken
  const expiryRes = await fetch(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(fbToken)}&access_token=${encodeURIComponent(debugAccessToken)}`
  )
  const expiryData = await expiryRes.json() as {
    data?: {
      expires_at?: number
      is_valid?: boolean
      type?: string
      scopes?: string[]
      granular_scopes?: Array<{ scope: string }>
    }
    error?: { message?: string }
  }
  const debugInfo = expiryData.data
  const tokenType = (debugInfo?.type ?? '').toUpperCase() // PAGE | USER | …
  const debugScopes = [
    ...(debugInfo?.scopes ?? []),
    ...(debugInfo?.granular_scopes ?? []).map(g => g.scope),
  ].filter(Boolean)
  const uniqueDebugScopes = [...new Set(debugScopes)]

  if (debugInfo) {
    const exp = debugInfo.expires_at
    const isValid = debugInfo.is_valid
    const expStr = exp && exp > 0
      ? `Sona eriyor: ${new Date(exp * 1000).toLocaleDateString('tr-TR')}`
      : 'Süresi yok (uzun ömürlü)'
    steps.push({
      name: 'Token Sona Erme',
      ok: isValid !== false,
      detail: isValid === false
        ? `❌ Token GEÇERSİZ/SÜRESİ DOLMUŞ`
        : `✓ ${expStr} | Tip: ${debugInfo.type ?? '?'}`,
    })
  } else if (expiryData.error) {
    steps.push({
      name: 'Token Sona Erme',
      ok: true,
      detail: `⚠️ debug_token okunamadı (${expiryData.error.message}) — /me geçerliyse devam`,
    })
  }

  // ── 4. Facebook Page erişimi ──────────────────────────────────────────────
  let fbPageOk = false
  if (pageId) {
    const pageRes = await graphGet(`/${pageId}`, fbToken)
    const pageData = pageRes.data as { name?: string; error?: { message?: string } }
    fbPageOk = pageRes.ok && !pageData.error
    steps.push({
      name: `Facebook Page (${pageId})`,
      ok: fbPageOk,
      detail: pageData.error ? `❌ ${pageData.error.message}` : `✓ "${pageData.name}"`,
    })
  }

  // ── 5. Instagram Business hesabı ──────────────────────────────────────────
  let igOk = false
  if (igBizId) {
    const igRes = await graphGet(`/${igBizId}?fields=name,username,followers_count`, igToken)
    const igData = igRes.data as { name?: string; username?: string; followers_count?: number; error?: { message?: string } }
    igOk = igRes.ok && !igData.error
    steps.push({
      name: `Instagram Business (${igBizId})`,
      ok: igOk,
      detail: igData.error
        ? `❌ ${igData.error.message}`
        : `✓ @${igData.username ?? '?'} — ${igData.followers_count ?? '?'} takipçi`,
    })
  }

  // ── 6. Token izinleri ─────────────────────────────────────────────────────
  // PAGE token'larda /me/permissions genelde boş döner — izinler USER token'dadır;
  // Page token bunları miras alır. Gerçek scope listesi /debug_token'dan gelir.
  const requiredPerms = [
    'pages_manage_posts',
    'instagram_content_publish',
    'instagram_basic',
    'pages_read_engagement',
  ]
  const isPageToken = tokenType === 'PAGE' || (!tokenType && !!meData.id && meData.id === pageId)

  const permRes = await graphGet('/me/permissions', fbToken)
  const permData = permRes.data as { data?: Array<{ permission: string; status: string }> }
  const userGrantedPerms = (permData.data ?? [])
    .filter(p => p.status === 'granted')
    .map(p => p.permission)

  const grantedPerms = uniqueDebugScopes.length > 0 ? uniqueDebugScopes : userGrantedPerms
  const missingPerms = requiredPerms.filter(p => !grantedPerms.includes(p))
  const scopesKnown = grantedPerms.length > 0

  let permsOk: boolean
  let permsDetail: string

  if (scopesKnown && missingPerms.length === 0) {
    permsOk = true
    permsDetail = `✓ Gerekli tüm izinler mevcut (${grantedPerms.length} scope)`
  } else if (isPageToken && fbPageOk && (igOk || !igBizId)) {
    // PAGE token + canlı Page/IG erişimi = paylaşım çalışıyor.
    // /me/permissions boş veya debug_token scope listesi eksik görünebilir — false positive değil.
    permsOk = true
    if (!scopesKnown) {
      permsDetail =
        '✓ PAGE token — /me/permissions boş olması normal. İzinler token\'ı veren kullanıcının User Token\'ındadır; ' +
        'Page token bunları miras alır. Page + Instagram erişimi doğrulandı → paylaşım için yeterli.'
    } else if (missingPerms.length > 0) {
      permsDetail =
        `✓ PAGE token geçerli (Page + IG erişimi OK). debug_token bazı scope'ları listelemedi: ${missingPerms.join(', ')}. ` +
        'Paylaşım zaten çalışıyorsa yok sayılabilir; sorun olursa Token Güncelle ile User Token izinlerini yenileyip Page Token alın.'
    } else {
      permsDetail = `✓ Gerekli tüm izinler mevcut (${grantedPerms.length} scope)`
    }
  } else if (scopesKnown && missingPerms.length > 0) {
    permsOk = false
    permsDetail = `❌ EKSİK: ${missingPerms.join(', ')} | Mevcut: ${grantedPerms.join(', ')}`
  } else if (isPageToken) {
    permsOk = false
    permsDetail =
      '❌ PAGE token scope listesi okunamadı ve Page/Instagram erişimi başarısız. ' +
      'Token Güncelle ile pages_manage_posts, instagram_content_publish, instagram_basic, pages_read_engagement izinlerini yeniden verin.'
  } else {
    permsOk = missingPerms.length === 0
    permsDetail = permsOk
      ? `✓ Gerekli tüm izinler mevcut`
      : `❌ EKSİK: ${missingPerms.join(', ')} | Mevcut: ${userGrantedPerms.join(', ') || '(boş)'}`
  }

  steps.push({
    name: 'Token İzinleri',
    ok: permsOk,
    detail: permsDetail,
  })

  // ── 7. OG görsel URL erişilebilirliği ─────────────────────────────────────
  // Bir test haberi ID'si bul
  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const db = getAdminFirestore()
    const snap = await db.collection('news')
      .where('status', '==', 'published')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()

    if (!snap.empty) {
      const testId = snap.docs[0].id
      const ogUrl  = `https://nahaber.com/api/og/social/${testId}`
      const imgRes = await fetch(ogUrl, { method: 'HEAD' })
      steps.push({
        name: 'OG Görsel URL Erişilebilirlik',
        ok: imgRes.ok,
        detail: `${ogUrl} → HTTP ${imgRes.status} | Content-Type: ${imgRes.headers.get('content-type') ?? '?'}`,
      })
    }
  } catch (e) {
    steps.push({ name: 'OG Görsel URL', ok: false, detail: `Firestore hatası: ${String(e)}` })
  }

  // ── 8. Threads token kontrolü ────────────────────────────────────────────
  const threadsUserId = process.env.THREADS_USER_ID?.trim() ?? ''
  const threadsToken  = process.env.THREADS_ACCESS_TOKEN?.trim() ?? ''

  if (!threadsUserId || !threadsToken) {
    const missing = [
      !threadsUserId && 'THREADS_USER_ID',
      !threadsToken  && 'THREADS_ACCESS_TOKEN',
    ].filter(Boolean).join(', ')
    steps.push({
      name: 'Threads Credentials',
      ok: false,
      detail: `❌ EKSİK: ${missing} — Vercel env ayarlayın`,
    })
  } else {
    try {
      const thRes = await fetch(
        `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${encodeURIComponent(threadsToken)}`
      )
      const thData = await thRes.json() as {
        id?: string; username?: string; error?: { message?: string; code?: number; type?: string; error_subcode?: number }
      }
      if (thRes.ok && !thData.error) {
        steps.push({
          name: 'Threads Token',
          ok: true,
          detail: `✓ @${thData.username ?? '?'} (id: ${thData.id}) — THREADS_USER_ID: ${threadsUserId}`,
        })
        if (thData.id && thData.id !== threadsUserId) {
          steps.push({
            name: 'Threads User ID Uyumsuzluğu',
            ok: false,
            detail: `⚠️ Token user id (${thData.id}) ≠ env THREADS_USER_ID (${threadsUserId}) — env güncellenmeli`,
          })
        }
      } else {
        steps.push({
          name: 'Threads Token',
          ok: false,
          detail: `❌ ${thData.error?.message ?? `HTTP ${thRes.status}`} (code: ${thData.error?.code ?? '?'}, type: ${thData.error?.type ?? '?'})`,
        })
      }
    } catch (e) {
      steps.push({ name: 'Threads Token', ok: false, detail: `❌ Bağlantı hatası: ${String(e)}` })
    }

    // ── 8b. Threads publish scope — dry-run TEXT container ────────────────
    try {
      const testBody = new URLSearchParams()
      testBody.set('access_token', threadsToken)
      testBody.set('text', 'NaHaber bağlantı testi — bu gönderi yayınlanmayacak')
      testBody.set('media_type', 'TEXT')
      const testRes = await fetch(
        `https://graph.threads.net/v1.0/${threadsUserId}/threads`,
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: testBody.toString() }
      )
      const testJson = await testRes.json() as {
        id?: string
        error?: { message?: string; code?: number; type?: string; error_subcode?: number; fbtrace_id?: string }
      }
      if (testRes.ok && testJson.id) {
        steps.push({
          name: 'Threads Publish Scope (TEXT)',
          ok: true,
          detail: `✓ TEXT container oluşturuldu (${testJson.id}) — threads_content_publish scope aktif`,
        })
      } else {
        const e = testJson.error
        const detail = e
          ? `❌ ${e.message} (code=${e.code}, type=${e.type ?? '?'}${e.error_subcode ? `, subcode=${e.error_subcode}` : ''}${e.fbtrace_id ? `, trace=${e.fbtrace_id}` : ''})`
          : `❌ HTTP ${testRes.status}`
        steps.push({
          name: 'Threads Publish Scope (TEXT)',
          ok: false,
          detail: detail + ' — threads_content_publish scope eksik veya token yetkisiz olabilir',
        })
      }
    } catch (e) {
      steps.push({ name: 'Threads Publish Scope', ok: false, detail: `❌ Test hatası: ${String(e)}` })
    }
  }

  // ── Özet ──────────────────────────────────────────────────────────────────
  const failedSteps = steps.filter(s => !s.ok)
  const summary = failedSteps.length === 0
    ? '✅ Tüm kontroller geçti — paylaşım çalışıyor olmalı'
    : `❌ ${failedSteps.length} sorun tespit edildi: ${failedSteps.map(s => s.name).join(', ')}`

  return NextResponse.json({ summary, steps })
}
