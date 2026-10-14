/**
 * POST /api/admin/social/reels/media-approval { newsId, approve } — editor confirms (or withdraws)
 * that NaHaber may use this story's image/video in reels. Stored on the news doc with who/when.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const b = await readJsonBody(request)
  const newsId = typeof b.newsId === 'string' ? b.newsId : ''
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(newsId)) return json({ error: 'newsId gerekli' }, 400)
  const ref = getAdminFirestore().collection(Collections.NEWS).doc(newsId)
  if (!(await ref.get()).exists) return json({ error: 'Haber bulunamadı' }, 404)
  await ref.set({ reelMediaApproval: b.approve === true ? { by: auth.ctx.uid, at: Date.now() } : FieldValue.delete() }, { merge: true })
  return json({ ok: true, approved: b.approve === true })
}
