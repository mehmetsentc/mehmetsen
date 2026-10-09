/**
 * GET  /api/admin/social/token  — yalnızca yapılandırma durumu (token veya parçası DÖNMEZ)
 * POST /api/admin/social/token  — yeni token'ı doğrular ve Firestore'a kaydeder (denetim kaydı yazılır)
 */
import { testModeLegacyRouteBlock } from '@/lib/social/testEnvironment'
import { NextResponse } from 'next/server'
import { platformError, safeErrorText } from '@/lib/social/safeLog'
import { FACEBOOK_GRAPH_BASE } from '@/lib/social/graphConfig'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { invalidateTokenCache } from '@/lib/social/tokenStore'
import { writeSocialAudit } from '@/lib/social/accounts/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GRAPH = FACEBOOK_GRAPH_BASE

async function validateFbToken(token: string): Promise<{
  ok: boolean
  name?: string
  type?: string
  expiresAt?: number
  permissions?: string[]
  note?: string
  error?: string
}> {
  try {
    // /me kontrolü
    const meRes = await fetch(`${GRAPH}/me?access_token=${token}`)
    const meData = await meRes.json() as { name?: string; id?: string; error?: { message?: string } }
    if (!meRes.ok || meData.error) {
      return { ok: false, error: platformError('facebook', 'token doğrulama', meRes.status, meData).message }
    }

    // İzin kontrolü — PAGE token'larda /me/permissions genelde boş (normal)
    const permRes = await fetch(`${GRAPH}/me/permissions?access_token=${token}`)
    const permData = await permRes.json() as { data?: Array<{ permission: string; status: string }> }
    const permissions = (permData.data ?? [])
      .filter(p => p.status === 'granted')
      .map(p => p.permission)

    const pageId = process.env.FACEBOOK_PAGE_ID?.trim()
    const isLikelyPageToken = !!pageId && meData.id === pageId
    const note = permissions.length === 0 && isLikelyPageToken
      ? 'PAGE token: /me/permissions boş olması normal — izinler User Token\'dadır.'
      : undefined

    return { ok: true, name: meData.name, type: isLikelyPageToken ? 'PAGE' : undefined, permissions, note }
  } catch (e) {
    return { ok: false, error: safeErrorText(e) }
  }
}

export async function GET(request: Request) {
  const testBlock = testModeLegacyRouteBlock()
  if (testBlock) return testBlock
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getAdminFirestore()
  const doc = await db.collection('config').doc('socialMedia').get()
  const data = doc.data() ?? {}

  const fbToken = (data.facebookPageToken as string | undefined) ?? ''
  const igToken = (data.instagramToken as string | undefined) ?? ''

  return NextResponse.json({
    hasFbToken: !!fbToken,
    hasIgToken: !!igToken,
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null,
    source: fbToken ? 'firestore' : 'env',
  })
}

export async function POST(request: Request) {
  const testBlock = testModeLegacyRouteBlock()
  if (testBlock) return testBlock
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    facebookPageToken?: string
    instagramToken?: string
  }

  const fbToken = body.facebookPageToken?.trim() ?? ''
  const igToken = body.instagramToken?.trim() ?? ''

  if (!fbToken) {
    return NextResponse.json({ error: 'facebookPageToken gerekli' }, { status: 400 })
  }

  // Facebook token'ı doğrula
  const validation = await validateFbToken(fbToken)
  if (!validation.ok) {
    return NextResponse.json({
      error: `Token geçersiz: ${validation.error}`,
      validation,
    }, { status: 400 })
  }

  // Firestore'a kaydet
  const db = getAdminFirestore()
  await db.collection('config').doc('socialMedia').set({
    facebookPageToken: fbToken,
    ...(igToken ? { instagramToken: igToken } : {}),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: auth.uid,
    validation: {
      name: validation.name,
      permissions: validation.permissions,
    },
  }, { merge: true })

  // Bellek cache'i temizle
  invalidateTokenCache()

  await writeSocialAudit({
    actorId: auth.uid,
    action: 'social.legacy_token.update',
    entityType: 'socialConfig',
    entityId: 'config/socialMedia',
    after: {
      hasFacebookPageToken: true,
      hasInstagramToken: Boolean(igToken),
      validatedName: validation.name ?? null,
      permissions: validation.permissions ?? [],
    },
  })

  return NextResponse.json({
    ok: true,
    name: validation.name,
    permissions: validation.permissions,
    note: validation.note,
    message: 'Token kaydedildi — sosyal medya paylaşımları artık bu token\'ı kullanacak.',
  })
}
