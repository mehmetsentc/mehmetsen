'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { ApproveForAiModal } from '@/components/admin/crawler/ApproveForAiModal'
import { RejectReasonModal } from '@/components/admin/crawler/RejectReasonModal'
import { auth } from '@/lib/firebase/auth'
import { EDITORIAL_DECISION_LABELS, EDITORIAL_PRIORITY_LABELS, CRAWLER_STATUS_LABELS, MACHINE_DRAFT_ELIGIBILITY_LABELS } from '@/services/crawler/editorial/labels'
import {
  crawlerEditorialStaleHours,
  requiresStaleSecondConfirm,
  staleConfirmMessage,
  staleWarning,
} from '@/services/crawler/editorial/controlPlane'
import type { CrawlerRejectionReason, EditorialPriority } from '@/services/crawler/types'
import { loadAdminJson } from '@/lib/adminApiError'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function ClusterDetailPage() {
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canary, setCanary] = useState<Record<string, unknown> | null>(null)
  const [canaryBusy, setCanaryBusy] = useState(false)

  const load = useCallback(async () => {
    const result = await loadAdminJson<Record<string, unknown>>(
      `/api/admin/crawler/clusters/${params.id}`,
      { headers: await authHeaders() }
    )
    if (!result.ok) {
      setError(result.error)
      setData(null)
      return
    }
    setError(null)
    setData(result.data)
  }, [params.id])

  const loadCanary = useCallback(async () => {
    setCanaryBusy(true)
    try {
      const result = await loadAdminJson<Record<string, unknown>>(
        `/api/admin/crawler/clusters/${params.id}/canary`,
        { headers: await authHeaders() }
      )
      if (!result.ok) {
        toast.error(result.error)
        setCanary(null)
        return
      }
      setCanary(result.data)
    } finally {
      setCanaryBusy(false)
    }
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  const cluster = data?.cluster as Record<string, unknown> | undefined
  const members = (data?.members as Array<Record<string, unknown>>) || []
  const groups = (data?.sourceGroups as Array<Record<string, unknown>>) || []
  const ageHours = Number(cluster?.ageHours || 0)
  const preflight = canary?.preflight as Record<string, unknown> | undefined
  const packMetrics = preflight?.packMetrics as Record<string, unknown> | undefined
  const sources = (preflight?.sources as Array<Record<string, unknown>>) || []


  async function act(op: string, extra?: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/crawler/clusters/${params.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ op, ...extra }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'İşlem başarısız')
      toast.success(op === 'approve_for_ai' ? 'AI için onaylandı. Dispatch KAPALI — provider çağrısı yok.' : op === 'review' ? 'İncelemeye alındı' : 'Güncellendi')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setBusy(false)
      setApproveOpen(false)
      setRejectOpen(false)
    }
  }

  return (
    <AdminOsPageShell title="Olay Kümesi" subtitle="Kanıt mevcut kayıtlardan. Yeni tarama yok. Dispatch kapalı.">
      <CrawlerSubnav />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {cluster ? (
        <div className="space-y-3 text-sm">
          <h2 className="text-lg font-semibold">{String(cluster.canonicalTitle || cluster.normalizedTopic)}</h2>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            {String(cluster.articleCount || members.length || 1)} haber /{' '}
            {String(cluster.uniqueSourceCount || groups.length || 1)} bağımsız kaynak — karar OLAY düzeyinde
          </p>
          <p>
            Coğrafya: {[cluster.countryCode, cluster.region, cluster.city, cluster.district].filter(Boolean).join(' / ') || '—'}
          </p>
          {cluster.hasMaterialUpdate || cluster.updateReviewStatus === 'UPDATE_AVAILABLE' ? (
            <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              GÜNCELLEME VAR — otomatik ikinci AI harcaması yok; editör karar verir.
            </p>
          ) : null}
          <p>
            Algoritmik: {CRAWLER_STATUS_LABELS[String(cluster.aiEligibility)] || String(cluster.aiEligibility)} ·{' '}
            <span className="font-medium">Editoryal karar:</span>{' '}
            {EDITORIAL_DECISION_LABELS[cluster.editorialDecision as keyof typeof EDITORIAL_DECISION_LABELS] || '—'} · Öncelik:{' '}
            {EDITORIAL_PRIORITY_LABELS[String(cluster.editorialPriority || 'NORMAL')]}
          </p>
          <p className="text-sm">
            <span className="font-medium">AI uygunluğu / Otomatik seçim:</span>{' '}
            {String(
              cluster.machineDraftEligibilityLabel ||
                MACHINE_DRAFT_ELIGIBILITY_LABELS[String(cluster.machineDraftEligibility || '')] ||
                CRAWLER_STATUS_LABELS[String(cluster.autoDraftStatus || '')] ||
                'Henüz sınıflandırılmadı'
            )}
            {cluster.machineDraftEligibilityReason ? ` · ${String(cluster.machineDraftEligibilityReason)}` : ''}
          </p>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Otomatik seçim editör onayı değildir. APPROVED_FOR_AI yalnızca insan kararıdır.
          </p>
          <p>
            Önem {String(cluster.importanceScore)} · Güven {String(cluster.clusterConfidence)} · Yaş {String(cluster.ageHours)}s · Keşif{' '}
            {String(cluster.firstSeenAt)}
            {cluster.hasMaterialUpdate ? ' · Maddi güncelleme var' : ''}
            {cluster.primarySelectionScore != null ? ` · Primary skor ${String(cluster.primarySelectionScore)}` : ''}
          </p>
          {Array.isArray(cluster.primarySelectionReasons) && cluster.primarySelectionReasons.length ? (
            <p className="text-xs text-[rgb(var(--color-muted))]">
              Primary nedenleri: {(cluster.primarySelectionReasons as string[]).join(' · ')}
            </p>
          ) : null}
          <p>
            {String(data?.sourceDiversity || cluster.sourceDiversity)} · {String(cluster.aiStatus || '—')}
          </p>
          <h3 className="font-semibold">PRIMARY</h3>
          <ul className="list-disc pl-5">
            {members.filter((m) => m.membershipRole === 'PRIMARY' || m.isCanonical).map((m, i) => (
              <li key={`p-${i}`}>{String(m.source)} — {String(m.title)}</li>
            ))}
          </ul>
          <h3 className="font-semibold">SUPPORTING</h3>
          <ul className="list-disc pl-5">
            {members.filter((m) => m.membershipRole !== 'PRIMARY' && !m.isCanonical).map((m, i) => (
              <li key={`s-${i}`}>{String(m.source)} — {String(m.membershipRole || 'SUPPORTING')} — {String(m.title)}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700"
              disabled={busy}
              onClick={() => void act('publish_editorial')}
            >
              Editoryal Taslak Oluştur & Yayınla
            </button>
            <button type="button" className="rounded-lg border px-3 py-1" disabled={busy} onClick={() => void act('review')}>
              İncelemeye Al
            </button>
            <button type="button" className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1 text-white" disabled={busy} onClick={() => setApproveOpen(true)}>
              AI İçin Onayla
            </button>
            <button type="button" className="rounded-lg border px-3 py-1" disabled={busy} onClick={() => void act('watch')}>
              İzlemeye Al
            </button>
            <button type="button" className="rounded-lg border px-3 py-1" disabled={busy} onClick={() => setRejectOpen(true)}>
              Reddet
            </button>
            <button type="button" className="rounded-lg border px-3 py-1" disabled={busy} onClick={() => void act('archive')}>
              Arşivle
            </button>
            {cluster.editorialDecision === 'REJECTED' || cluster.editorialDecision === 'ARCHIVED' ? (
              <button type="button" className="rounded-lg border px-3 py-1" disabled={busy} onClick={() => void act('restore')}>
                Geri Yükle
              </button>
            ) : null}
          </div>
          {cluster.publishedNewsId ? (
            <div className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              ✓ Bu küme kanonik olarak yayında: <strong>{String(cluster.publishedNewsId)}</strong>
            </div>
          ) : null}
          <h3 className="font-semibold">Kaynaklar ({groups.length})</h3>
          <ul className="list-disc pl-5">
            {groups.map((g) => (
              <li key={String(g.sourceId)}>
                {String(g.source)} — {String(g.articleCount)} haber · kalite {String((g.rows as Array<{ qualityTier?: string }>)?.[0]?.qualityTier || '—')}
              </li>
            ))}
          </ul>

          <section className="mt-4 space-y-2 rounded-lg border border-[rgb(var(--color-border))] p-3">
            <h3 className="font-semibold">DeepSeek Canary Preflight (Stage 1)</h3>
            <p className="text-xs text-[rgb(var(--color-muted))]">
              APPROVED_FOR_AI ücretli çağrı yetkisi vermez. Otomatik yayın KAPALI. Toplu AI butonu yok.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-1"
                disabled={canaryBusy}
                onClick={() => void loadCanary()}
              >
                {canaryBusy ? 'Hesaplanıyor…' : 'Preflight Göster'}
              </button>
              <button
                type="button"
                className="rounded-lg border px-3 py-1 opacity-60"
                disabled
                title="Stage 2’de açık onay sonrası"
              >
                CANARY&apos;Yİ ÇALIŞTIR (kilitli)
              </button>
            </div>
            {preflight ? (
              <div className="space-y-1 text-xs">
                <p>
                  Durum: {String(preflight.state)}
                  {preflight.blockedReason ? ` · Engelleme: ${String(preflight.blockedReason)}` : ''}
                </p>
                <p>
                  Model: {String(preflight.provider)}/{String(preflight.model)} · Tahmini token:{' '}
                  {String(preflight.estimatedTotalTokens)} · Max maliyet: ${String(preflight.maxCostUsdPerEvent)} · Tahmini:{' '}
                  {preflight.estimatedCostUsd == null ? 'COST_UNKNOWN' : `$${String(preflight.estimatedCostUsd)}`}
                </p>
                <p>
                  Otomatik yayın: {String(preflight.autoPublishLabelTr || 'KAPALI')} · Kaynak sayısı:{' '}
                  {String(packMetrics?.sourceCount ?? sources.length)}
                  {packMetrics?.rssSnippetExcludedCount
                    ? ` · RSS snippet hariç: ${String(packMetrics.rssSnippetExcludedCount)}`
                    : ''}
                </p>
                <ul className="list-disc pl-5">
                  {sources.map((s, i) => (
                    <li key={i}>
                      {String(s.role)} — {String(s.sourceName)} — {String(s.title)}
                    </li>
                  ))}
                </ul>
                <p className="text-[rgb(var(--color-muted))]">{String(canary?.messageTr || '')}</p>
              </div>
            ) : null}
          </section>

          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-2 py-1">Rol</th>
                <th className="px-2 py-1">Kaynak</th>
                <th className="px-2 py-1">Sağlık</th>
                <th className="px-2 py-1">Başlık</th>
                <th className="px-2 py-1">Kelime / karakter</th>
                <th className="px-2 py-1">Yöntem</th>
                <th className="px-2 py-1">Görsel</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const media = m.media as { mediaCount?: number; primaryUrl?: string | null } | undefined
                return (
                  <tr key={i} className="border-t border-[rgb(var(--color-border))]">
                    <td className="px-2 py-1">{String(m.membershipRole || (m.isCanonical ? 'PRIMARY' : 'SUPPORTING'))}</td>
                    <td className="px-2 py-1">
                      {String(m.source)} · {String(m.sourceStatus || '')}
                    </td>
                    <td className="px-2 py-1">
                      {String(m.healthScore ?? '—')} / güven {String(m.extractionConfidence)}
                    </td>
                    <td className="px-2 py-1">
                      <button type="button" className="underline" onClick={() => setOpen(open === i ? null : i)}>
                        {String(m.title)}
                      </button>
                      {open === i ? (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-[rgb(var(--color-muted))]">
                          {String(m.body || m.preview || '')}
                        </p>
                      ) : null}
                      <div className="text-xs text-[rgb(var(--color-muted))]">{String(m.url || '')}</div>
                      <div className="text-xs">{m.publishedAt ? new Date(String(m.publishedAt)).toLocaleString('tr-TR') : '—'}</div>
                    </td>
                    <td className="px-2 py-1">
                      {String(m.wordCount)} / {String(m.charCount)}
                    </td>
                    <td className="px-2 py-1">{String(m.extractionMethod || '—')}</td>
                    <td className="px-2 py-1">
                      {(m.images as Array<{ url?: string; discoveryMethod?: string; isPrimary?: boolean }> | undefined)?.length
                        ? (m.images as Array<{ url: string; discoveryMethod?: string; isPrimary?: boolean }>).map((img) => (
                            <div key={img.url} className="mb-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img.url} alt="" className="h-12 w-16 rounded object-cover" />
                              <div className="text-[10px]">
                                {img.isPrimary ? 'birincil' : 'aday'} · {img.discoveryMethod || '—'}
                              </div>
                            </div>
                          ))
                        : `${media?.mediaCount || 0} aday`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <ApproveForAiModal
        open={approveOpen}
        count={1}
        busy={busy}
        staleWarning={staleWarning(ageHours, crawlerEditorialStaleHours())}
        staleConfirmRequired={requiresStaleSecondConfirm(ageHours)}
        staleMessage={requiresStaleSecondConfirm(ageHours) ? staleConfirmMessage(ageHours) : null}
        onClose={() => setApproveOpen(false)}
        onConfirm={(p: EditorialPriority, confirmStale: boolean) => void act('approve_for_ai', { editorialPriority: p, confirmStale })}
      />
      <RejectReasonModal
        open={rejectOpen}
        count={1}
        busy={busy}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason: CrawlerRejectionReason, note: string) => void act('reject', { reason, note })}
      />
    </AdminOsPageShell>
  )
}
