/**
 * POST /api/social/eligibility  { newsId, decision: 'allowed' | 'blocked' | 'clear', mediaRights?, note? }
 *
 * Editor's social-publishing decision for one news item (content + media
 * rights). Requires CMS `news:publish` and the `publish` staff right inside the
 * news' scope (il / ilçe / kategori editors only for their own content).
 * Source fields are never touched. Audited; the news is re-evaluated against
 * enabled automation rules right away.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { contentScopeOf } from '@/lib/cms/rbacScope'
import { denyIfMissingStaffRights, denyIfOutsideStaffScope } from '@/lib/cms/staffScopeHttp'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'
import { isSameOriginRequest, readJsonBody } from '@/lib/social/accounts/connect/routeHelpers'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { SOCIAL_MEDIA_RIGHTS, type SocialMediaRights } from '@/lib/social/eligibility'
import { onNewsWritten } from '@/lib/social/automation/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NEWS_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json({ error: 'Geçersiz istek kaynağı', code: 'bad_origin' }, 403)
  const auth = await verifyCmsToken(request, 'news:publish', { scopeAware: true })
  if (!auth) return json({ error: 'Yetkisiz', code: 'unauthorized' }, 401)
  const body = await readJsonBody(request)
  const newsId = typeof body.newsId === 'string' ? body.newsId.trim() : ''
  if (!NEWS_ID_RE.test(newsId)) return json({ error: 'Geçersiz haber', code: 'invalid_news' }, 400)
  const decision = body.decision
  if (decision !== 'allowed' && decision !== 'blocked' && decision !== 'clear') return json({ error: 'Geçersiz karar', code: 'invalid_decision' }, 400)
  const mediaRights = body.mediaRights as SocialMediaRights | undefined
  if (decision === 'allowed' && !(SOCIAL_MEDIA_RIGHTS as readonly string[]).includes(mediaRights ?? '')) {
    return json({ error: 'Uygun işaretlemek için görsel kullanım hakkını seçin', code: 'media_rights_required' }, 400)
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : ''

  const db = getAdminFirestore()
  const ref = db.collection(Collections.NEWS).doc(newsId)
  const snap = await ref.get()
  if (!snap.exists) return json({ error: 'Haber bulunamadı', code: 'not_found' }, 404)
  const data = snap.data() as Record<string, unknown>
  const outside = denyIfOutsideStaffScope(auth, contentScopeOf(data))
  if (outside) return outside
  const noRight = denyIfMissingStaffRights(auth, ['publish'], contentScopeOf(data))
  if (noRight) return noRight

  const now = Date.now()
  const before = data.socialEligibility ?? null
  const record =
    decision === 'clear'
      ? null
      : { status: decision, mediaRights: decision === 'allowed' ? mediaRights : null, note: note || null, by: auth.uid, at: now }
  await ref.update({ socialEligibility: record ?? FieldValue.delete() })
  await writeSocialAudit({
    actorId: auth.uid,
    action: 'social.eligibility.set',
    entityType: 'news',
    entityId: newsId,
    before: before ? { socialEligibility: before } : null,
    after: { socialEligibility: record },
  })
  // Re-evaluate against enabled rules now (allowed → jobs may open; blocked → queued jobs cancel).
  const merged = { ...data, socialEligibility: record ?? undefined }
  const published = String(data.status ?? '') === 'published'
  await onNewsWritten({ newsId, data: merged, becamePublished: false, wasPublished: published, now })
  return json({ ok: true, socialEligibility: record })
}
