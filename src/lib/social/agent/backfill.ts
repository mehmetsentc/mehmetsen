/**
 * GÖREV 43 B1 — Geçmiş elle paylaşımları (cmsAuditLogs · social.publish.manual)
 * karar kaydına aktarır. Tekrar çalıştırmak zararsızdır (tekil belge kimliği).
 * Okuma: ≤3000 denetim kaydı + paylaşılan haber sayısı kadar belge.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { platformOfAccountId } from '@/lib/social/automation/types'
import type { ShareDecision } from './core'
import { decisionsFromPublish, recordShareDecisions } from './store'

export async function backfillDecisionsFromAudit(now = Date.now(), days = 90): Promise<{ audits: number; decisions: number; news: number }> {
  const db = getAdminFirestore()
  const since = now - days * 86_400_000
  type Audit = { createdAt?: number; actorId?: string; entityId?: string; meta?: Record<string, unknown> }
  const [manualSnap, shareSnap] = await Promise.all([
    db.collection(Collections.CMS_AUDIT_LOGS).where('action', '==', 'social.publish.manual').limit(3000).get(),
    db.collection(Collections.CMS_AUDIT_LOGS).where('action', '==', 'social.publish.share').limit(3000).get(),
  ])
  const keep = (a: Audit) => typeof a.createdAt === 'number' && a.createdAt >= since && !!a.meta && typeof a.meta.newsId === 'string'
  // «Hesaplara Paylaş» kaydı: tek hesap (entityId) + biçim + ledger sonucu → composer meta biçimine çevrilir.
  const shareAsManual = (a: Audit): Audit | null => {
    const format = a.meta?.format
    const platform = a.entityId ? platformOfAccountId(a.entityId) : null
    if (a.meta?.result !== 'succeeded' || !platform || (format !== 'post' && format !== 'story')) return null
    return { ...a, meta: { newsId: a.meta.newsId, [format]: { [platform]: { ok: true, account: a.entityId } } } }
  }
  const audits: Audit[] = [
    ...manualSnap.docs.map((d) => d.data() as Audit).filter(keep),
    ...shareSnap.docs.map((d) => d.data() as Audit).filter(keep).map(shareAsManual).filter((a): a is Audit => a !== null),
  ]
  const ids = [...new Set(audits.map((a) => String(a.meta!.newsId)))]
  const news = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => db.collection(Collections.NEWS).doc(id))
    const docs = refs.length ? await db.getAll(...refs) : []
    for (const d of docs) if (d.exists) news.set(d.id, d.data() as Record<string, unknown>)
  }
  const decisions: ShareDecision[] = audits.flatMap((a) => {
    const id = String(a.meta!.newsId)
    return decisionsFromPublish({
      newsId: id,
      news: news.get(id) ?? null,
      result: a.meta as Parameters<typeof decisionsFromPublish>[0]['result'],
      actorUid: a.actorId ?? null,
      at: a.createdAt as number,
      source: 'backfill',
    })
  })
  let written = 0
  for (let i = 0; i < decisions.length; i += 400) written += await recordShareDecisions(decisions.slice(i, i + 400))
  return { audits: audits.length, decisions: written, news: news.size }
}
