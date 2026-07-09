import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getSlotDefinition } from '@/constants/adSlots'
import { docToAdBanner } from '@/lib/adBannerUtils'
import type { AdBannerFormat, AdBannerPage, AdBannerSize } from '@/types/adBanner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseBody(raw: Record<string, unknown>) {
  const slotId = String(raw.slotId ?? '').trim()
  const slot = getSlotDefinition(slotId)
  if (!slot && !slotId.startsWith('category-all-')) {
    return { error: 'Geçersiz reklam alanı' as const }
  }

  const format = String(raw.format ?? 'image') as AdBannerFormat
  if (!['image', 'video', 'html'].includes(format)) {
    return { error: 'Geçersiz format' as const }
  }

  const name = String(raw.name ?? '').trim()
  if (!name) return { error: 'Reklam adı gerekli' as const }

  if (format === 'image' && !String(raw.imageUrl ?? '').trim()) {
    return { error: 'Görsel URL gerekli' as const }
  }
  if (format === 'video' && !String(raw.videoUrl ?? '').trim()) {
    return { error: 'Video URL gerekli' as const }
  }
  if (format === 'html' && !String(raw.htmlContent ?? '').trim()) {
    return { error: 'HTML içerik gerekli' as const }
  }

  return {
    data: {
      name,
      slotId,
      page: (slot?.page ?? (slotId.startsWith('category-all-') ? 'all_categories' : 'category')) as AdBannerPage,
      categoryId: slot?.categoryId ?? (raw.categoryId ? String(raw.categoryId) : null),
      position: slot?.position ?? String(raw.position ?? 'top'),
      format,
      size: (slot?.size ?? raw.size ?? 'leaderboard') as AdBannerSize,
      imageUrl: raw.imageUrl ? String(raw.imageUrl).trim() : null,
      videoUrl: raw.videoUrl ? String(raw.videoUrl).trim() : null,
      htmlContent: raw.htmlContent ? String(raw.htmlContent).trim() : null,
      clickUrl: raw.clickUrl ? String(raw.clickUrl).trim() : null,
      altText: raw.altText ? String(raw.altText).trim() : null,
      active: raw.active !== false,
      priority: typeof raw.priority === 'number' ? raw.priority : Number(raw.priority) || 0,
      startsAt: raw.startsAt ? String(raw.startsAt) : null,
      endsAt: raw.endsAt ? String(raw.endsAt) : null,
    },
  }
}

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'seo:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = getAdminFirestore()
    const snap = await db.collection(Collections.AD_BANNERS).limit(200).get()
    const banners = snap.docs
      .map((d) => docToAdBanner(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    return NextResponse.json({ banners })
  } catch (err) {
    console.error('[api/admin/ads GET]', err)
    return NextResponse.json({ error: 'Liste alınamadı' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'seo:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 })
  }

  const parsed = parseBody(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const db = getAdminFirestore()
    const ref = await db.collection(Collections.AD_BANNERS).add({
      ...parsed.data,
      createdBy: auth.email,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    const doc = await ref.get()
    const banner = docToAdBanner(doc.id, doc.data() as Record<string, unknown>)
    return NextResponse.json({ banner }, { status: 201 })
  } catch (err) {
    console.error('[api/admin/ads POST]', err)
    return NextResponse.json({ error: 'Kayıt oluşturulamadı' }, { status: 500 })
  }
}
