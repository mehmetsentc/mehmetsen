import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { hasPermission } from '@/types/cms'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { TURKISH_PROVINCES } from '@/constants/cities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Post-publish classification fix for AI-published crawler articles.
 * Only category / location / tags — no full re-edit or AI re-run.
 */
export async function PATCH(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(auth.role, 'news:edit')) {
    return NextResponse.json({ error: 'Yetkiniz yok' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    newsId?: string
    categoryId?: string
    citySlug?: string | null
    tags?: string[]
    completeReview?: boolean
  }

  const newsId = body.newsId?.trim()
  if (!newsId) return NextResponse.json({ error: 'newsId gerekli' }, { status: 400 })

  const db = getAdminFirestore()
  const ref = db.collection(Collections.NEWS).doc(newsId)
  const snap = await ref.get()
  if (!snap.exists) return NextResponse.json({ error: 'Haber bulunamadı' }, { status: 404 })

  const data = snap.data() || {}
  const rssGuid = String(data.rssGuid || '')
  if (!rssGuid.startsWith('raw_')) {
    return NextResponse.json({ error: 'Yalnızca crawler kaynaklı haberler düzenlenebilir' }, { status: 409 })
  }

  const update: Record<string, unknown> = {
    updatedAt: Date.now(),
    manuallyEdited: true,
    manualEditedBy: auth.uid,
  }

  if (body.categoryId?.trim()) {
    const categoryId = body.categoryId.trim()
    const valid = DEFAULT_CATEGORIES.some((c) => c.id === categoryId)
    if (!valid) return NextResponse.json({ error: 'Geçersiz kategori' }, { status: 400 })
    update.categoryId = categoryId
    update.category = categoryId
  }

  if (body.citySlug !== undefined) {
    const slug = String(body.citySlug || '').trim().toLowerCase()
    if (slug) {
      const province = TURKISH_PROVINCES.find((p) => p.slug === slug)
      if (!province) return NextResponse.json({ error: 'Geçersiz şehir' }, { status: 400 })
      update.citySlug = slug
      update.city = province.name
      update.country = 'Türkiye'
    } else {
      update.citySlug = ''
      update.city = ''
    }
  }

  if (Array.isArray(body.tags)) {
    update.tags = body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 12)
  }

  if (body.completeReview === true) {
    update.needsReview = false
    update.aiAutoPublished = false
    update.needsAdminReview = false
  }

  if (Object.keys(update).length <= 3) {
    return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 })
  }

  await ref.update(update)
  return NextResponse.json({ ok: true, newsId })
}
