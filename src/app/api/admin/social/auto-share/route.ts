/**
 * GET  /api/admin/social/auto-share — otomatik paylaşım ayarları
 * PUT  /api/admin/social/auto-share — güncelle
 */
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { normalizeAutoShareSettings } from '@/lib/social/autoShareSettings'
import { invalidateAutoShareSettingsCache } from '@/lib/social/autoShareSettingsStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOC = { collection: 'config', id: 'socialAutoShare' } as const

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getAdminFirestore()
  const snap = await db.collection(DOC.collection).doc(DOC.id).get()
  const settings = normalizeAutoShareSettings(snap.exists ? snap.data() : null)

  return NextResponse.json({
    autoPost: settings.autoPost,
    autoStory: settings.autoStory,
    autoOnPublish: settings.autoOnPublish,
    metaAiRewrite: settings.metaAiRewrite,
    enabledCitySlugs: settings.enabledCitySlugs,
    updatedAt: settings.updatedAt ?? null,
    updatedBy: settings.updatedBy ?? null,
  })
}

export async function PUT(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 })
  }

  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const settings = normalizeAutoShareSettings({
    autoPost: typeof b.autoPost === 'boolean' ? b.autoPost : true,
    autoStory: typeof b.autoStory === 'boolean' ? b.autoStory : true,
    autoOnPublish: typeof b.autoOnPublish === 'boolean' ? b.autoOnPublish : true,
    metaAiRewrite: typeof b.metaAiRewrite === 'boolean' ? b.metaAiRewrite : false,
    enabledCitySlugs: b.enabledCitySlugs,
  })

  const payload = {
    autoPost: settings.autoPost,
    autoStory: settings.autoStory,
    autoOnPublish: settings.autoOnPublish,
    metaAiRewrite: settings.metaAiRewrite,
    enabledCitySlugs: settings.enabledCitySlugs,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: auth.uid,
  }

  const db = getAdminFirestore()
  await db.collection(DOC.collection).doc(DOC.id).set(payload, { merge: true })
  invalidateAutoShareSettingsCache()

  return NextResponse.json({
    ok: true,
    ...settings,
    message: 'Otomatik paylaşım ayarları kaydedildi',
  })
}
