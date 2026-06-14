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
    const res = await fetch(`${GRAPH}${path}?access_token=${token}`)
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
  const fbToken   = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ?? ''
  const igToken   = process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || fbToken
  const pageId    = process.env.FACEBOOK_PAGE_ID?.trim() ?? ''
  const igBizId   = process.env.INSTAGRAM_BUSINESS_ID?.trim() ?? ''

  // ── 1. Env vars mevcut mu? ────────────────────────────────────────────────
  steps.push({
    name: 'Env Değişkenleri',
    ok: !!(fbToken && pageId && igBizId),
    detail: [
      `FACEBOOK_PAGE_ACCESS_TOKEN: ${fbToken ? `✓ (${fbToken.length} karakter)` : '✗ EKSİK'}`,
      `FACEBOOK_PAGE_ID: ${pageId ? `✓ ${pageId}` : '✗ EKSİK'}`,
      `INSTAGRAM_BUSINESS_ID: ${igBizId ? `✓ ${igBizId}` : '✗ EKSİK'}`,
      `INSTAGRAM_ACCESS_TOKEN: ${process.env.INSTAGRAM_ACCESS_TOKEN ? '✓ (ayrı)' : '(FB token kullanılıyor)'}`,
    ].join(' | '),
  })

  if (!fbToken) {
    return NextResponse.json({ steps, summary: 'FACEBOOK_PAGE_ACCESS_TOKEN eksik — Vercel env ayarlayın.' })
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

  // ── 3. Token izinleri ─────────────────────────────────────────────────────
  const permRes = await graphGet('/me/permissions', fbToken)
  const permData = permRes.data as { data?: Array<{ permission: string; status: string }> }
  const grantedPerms = (permData.data ?? []).filter(p => p.status === 'granted').map(p => p.permission)
  const requiredPerms = ['pages_manage_posts', 'instagram_content_publish', 'instagram_basic', 'pages_read_engagement']
  const missingPerms  = requiredPerms.filter(p => !grantedPerms.includes(p))
  steps.push({
    name: 'Token İzinleri',
    ok: missingPerms.length === 0,
    detail: missingPerms.length === 0
      ? `✓ Gerekli tüm izinler mevcut`
      : `❌ EKSİK: ${missingPerms.join(', ')} | Mevcut: ${grantedPerms.join(', ')}`,
  })

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

  // ── 5. Token sona erme tarihi ─────────────────────────────────────────────
  const debugRes = await graphGet('/debug_token', `${fbToken}&input_token=${fbToken}&access_token=${fbToken}`)
  // debug_token requires app token - try /me?fields=...
  const expiryRes = await fetch(
    `${GRAPH}/debug_token?input_token=${fbToken}&access_token=${fbToken}`,
    { headers: { 'Content-Type': 'application/json' } }
  )
  const expiryData = await expiryRes.json() as {
    data?: { expires_at?: number; is_valid?: boolean; type?: string; scopes?: string[] }
  }
  if (expiryData.data) {
    const exp = expiryData.data.expires_at
    const isValid = expiryData.data.is_valid
    const expStr = exp && exp > 0
      ? `Sona eriyor: ${new Date(exp * 1000).toLocaleDateString('tr-TR')}`
      : 'Süresi yok (uzun ömürlü)'
    steps.push({
      name: 'Token Sona Erme',
      ok: isValid !== false,
      detail: isValid === false ? `❌ Token GEÇERSİZ/SÜRESİ DOLMUŞ` : `✓ ${expStr} | Tip: ${expiryData.data.type ?? '?'}`,
    })
  }

  // ── 6. Instagram Business hesabı ──────────────────────────────────────────
  if (igBizId) {
    const igRes = await graphGet(`/${igBizId}?fields=name,username,followers_count`, igToken)
    const igData = igRes.data as { name?: string; username?: string; followers_count?: number; error?: { message?: string } }
    steps.push({
      name: `Instagram Business (${igBizId})`,
      ok: igRes.ok && !igData.error,
      detail: igData.error
        ? `❌ ${igData.error.message}`
        : `✓ @${igData.username ?? '?'} — ${igData.followers_count ?? '?'} takipçi`,
    })
  }

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

  // ── Özet ──────────────────────────────────────────────────────────────────
  const failedSteps = steps.filter(s => !s.ok)
  const summary = failedSteps.length === 0
    ? '✅ Tüm kontroller geçti — paylaşım çalışıyor olmalı'
    : `❌ ${failedSteps.length} sorun tespit edildi: ${failedSteps.map(s => s.name).join(', ')}`

  return NextResponse.json({ summary, steps })
}
