import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { canApproveAd, canManageAd, isLocalAdSlot } from '@/lib/cms/adScope'
import { getSlotDefinition } from '@/constants/adSlots'
import { docToAdBanner } from '@/lib/adBannerUtils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'seo:edit', { scopeAware: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }

  if (body.name != null) updates.name = String(body.name).trim()
  if (body.slotId != null) {
    const slotId = String(body.slotId).trim()
    const slot = getSlotDefinition(slotId)
    if (!slot && !slotId.startsWith('category-all-')) {
      return NextResponse.json({ error: 'Geçersiz reklam alanı' }, { status: 400 })
    }
    updates.slotId = slotId
    if (slot) {
      updates.page = slot.page
      updates.categoryId = slot.categoryId ?? null
      updates.position = slot.position
      updates.size = slot.size
    }
  }
  if (body.format != null) updates.format = body.format
  if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null
  if (body.imageUrlLight !== undefined) updates.imageUrlLight = body.imageUrlLight ? String(body.imageUrlLight).trim() : null
  if (body.imageUrlDark !== undefined) updates.imageUrlDark = body.imageUrlDark ? String(body.imageUrlDark).trim() : null
  if (body.videoUrl !== undefined) updates.videoUrl = body.videoUrl ? String(body.videoUrl).trim() : null
  if (body.htmlContent !== undefined) updates.htmlContent = body.htmlContent ? String(body.htmlContent).trim() : null
  if (body.clickUrl !== undefined) updates.clickUrl = body.clickUrl ? String(body.clickUrl).trim() : null
  if (body.altText !== undefined) updates.altText = body.altText ? String(body.altText).trim() : null
  if (body.active != null) updates.active = Boolean(body.active)
  if (body.priority != null) updates.priority = Number(body.priority) || 0
  if (body.startsAt !== undefined) updates.startsAt = body.startsAt || null
  if (body.endsAt !== undefined) updates.endsAt = body.endsAt || null

  const scoped = auth.scope.kind !== 'unscoped'
  if (scoped) {
    if (updates.format === 'html' || (body.htmlContent !== undefined && body.htmlContent)) {
      return NextResponse.json({ error: 'Yerel reklamlarda HTML kullanılamaz' }, { status: 400 })
    }
    if (typeof updates.slotId === 'string' && !isLocalAdSlot(updates.slotId)) {
      return NextResponse.json({ error: 'Yerel reklamlar yalnızca Yerel Haber alanlarına eklenir' }, { status: 400 })
    }
  }

  try {
    const db = getAdminFirestore()
    const ref = db.collection(Collections.AD_BANNERS).doc(id)
    const existing = await ref.get()
    if (!existing.exists) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 })
    const current = docToAdBanner(existing.id, existing.data() as Record<string, unknown>)
    // Phase 2: scope + approval. Targeting (il/ilçe) is never editable here.
    if (!canManageAd(auth, current)) return NextResponse.json({ error: 'Yetki kapsamı dışında' }, { status: 403 })
    const approver = canApproveAd(auth, current)
    if (body.status !== undefined) {
      if (!approver) return NextResponse.json({ error: 'Onay yetkiniz yok' }, { status: 403 })
      if (body.status !== 'approved' && body.status !== 'rejected' && body.status !== 'pending') {
        return NextResponse.json({ error: 'Geçersiz durum' }, { status: 400 })
      }
      updates.status = body.status
      updates.reviewedBy = auth.uid
    } else if (current.provinceSlug && !approver) {
      // Any content change by a non-approver needs a fresh approval.
      updates.status = 'pending'
      updates.reviewedBy = null
    }

    await ref.update(updates)
    const doc = await ref.get()
    return NextResponse.json({ banner: docToAdBanner(doc.id, doc.data() as Record<string, unknown>) })
  } catch (err) {
    console.error('[api/admin/ads PATCH]', err)
    return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'seo:edit', { scopeAware: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  try {
    const db = getAdminFirestore()
    const ref = db.collection(Collections.AD_BANNERS).doc(id)
    const existing = await ref.get()
    if (!existing.exists) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 })
    if (!canManageAd(auth, docToAdBanner(existing.id, existing.data() as Record<string, unknown>))) {
      return NextResponse.json({ error: 'Yetki kapsamı dışında' }, { status: 403 })
    }
    await ref.delete()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/admin/ads DELETE]', err)
    return NextResponse.json({ error: 'Silinemedi' }, { status: 500 })
  }
}
