'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'
import {
  P18_4E_COHORT1_BATCH_ID,
  sortRightsReviewQueueByRisk,
  type BatchRightsProgress,
} from '@/services/editorial/canonicalRightsReviewQueue'
import {
  RIGHTS_PAGE,
  RIGHTS_STATUS_TR,
  RISK_TR,
  publicationStateTr,
  riskRecommendationTr,
} from '@/lib/editorial/rightsUiTr'

const PILOT_IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

const BULK_MAX = 50

type QueueFiltre = 'all' | 'cohort1'
type StatusFiltre = 'all' | 'PENDING' | 'REWRITE_REQUIRED' | 'DO_NOT_PUBLISH' | 'CLEARED'
type RiskFiltre = 'all' | 'HIGH_SOURCE_OVERLAP' | 'MEDIUM_OVERLAP' | 'LOW_OVERLAP' | 'SOURCE_NOT_EVALUABLE'

type QueueItem = {
  id: string
  kind?: 'pilot' | 'cohort'
  title?: string | null
  source?: string | null
  sourceUrl?: string | null
  status?: string | null
  rightsStatus?: string | null
  migrationBatchId?: string | null
  risk?: string | null
}

type Review = {
  id: string
  slug: string
  title: string
  summary: string | null
  content: string | null
  status: string
  source: string | null
  sourceUrl: string | null
  publicationAuthority: string | null
  rightsStatus: string | null
  rightsBasis: string | null
  rightsDecidedAt: string | null
  editorialBlocker: string | null
  bodyLen: number
  hasApprovedBy: boolean
  hasPublishedBy: boolean
  hasRightsDecidedBy: boolean
  migrationBatchId: string | null
  publishEligible?: boolean
  gate: {
    publishable: boolean
    blockers: string[]
    executePublish: false
  }
  availableActions: string[]
  availableBases: string[]
}

type SourceOverlapAudit = {
  evaluated: boolean
  aiInvolved: false
  sourceFetchStatus: string
  sourceBodyAvailable: boolean
  canonicalBodyChars: number
  sourceBodyChars: number
  similarity: number | null
  jaccard: number | null
  ngram3: number | null
  tokenMatchRatio: number | null
  maxSharedContiguousRun: number | null
  gateOverlapCategory: string | null
  risk: string
  classificationReason: string
  clearanceImplied: false
  note: string
}

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function riskTone(risk: string): string {
  if (risk === 'HIGH_SOURCE_OVERLAP') return 'border-amber-300 bg-amber-50 text-amber-950'
  if (risk === 'MEDIUM_OVERLAP') return 'border-yellow-200 bg-yellow-50 text-yellow-950'
  if (risk === 'SOURCE_NOT_EVALUABLE') return 'border-zinc-200 bg-zinc-50 text-zinc-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-950'
}

async function authHeaders(): Promise<HeadersInit> {
  const { getAuth } = await import('firebase/auth')
  const user = getAuth().currentUser
  if (!user) throw new Error('Oturum gerekli')
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function confirmRightsSave(opts: {
  status: string
  risk: string | null
  title: string
  id: string
}): boolean {
  if (opts.status === 'CLEARED') {
    const high = opts.risk === 'HIGH_SOURCE_OVERLAP'
    const msg = high
      ? [
          'Yüksek benzerlik uyarısı',
          '',
          'Benzerlik oranı telif onayı değildir.',
          `Yüksek benzerlik skoruyla “${RIGHTS_STATUS_TR.CLEARED}” kararı veriyorsunuz.`,
          '',
          opts.title,
          '',
          'Bu işlem haberi yayınlamaz. Devam?',
        ].join('\n')
      : [
          `${RIGHTS_STATUS_TR.CLEARED} onayı`,
          '',
          'Benzerlik kanıtı telif onayı değildir.',
          'Karar insan editöre aittir.',
          '',
          opts.title,
          '',
          'Bu işlem haberi yayınlamaz. Devam?',
        ].join('\n')
    return window.confirm(msg)
  }
  if (opts.status === 'DO_NOT_PUBLISH') {
    return window.confirm(
      [
        `${RIGHTS_STATUS_TR.DO_NOT_PUBLISH} onayı`,
        '',
        'Haber silinmez; denetlenebilir kalır.',
        'Durum taslakta kalır; yayın engellenir.',
        '',
        opts.title,
        '',
        'Devam?',
      ].join('\n')
    )
  }
  if (opts.status === 'REWRITE_REQUIRED') {
    return window.confirm(
      [
        `${RIGHTS_STATUS_TR.REWRITE_REQUIRED} onayı`,
        '',
        'Yalnızca insan kararı — benzerlik skoru engeli otomatik yazmaz.',
        opts.title,
        '',
        'Devam?',
      ].join('\n')
    )
  }
  return true
}

function PilotCard({
  id,
  onSaved,
  deferPublish,
  selected,
  onToggleSelect,
}: {
  id: string
  onSaved: () => void
  /** P18.4E.3: cohort publish deferred — keep button disabled. */
  deferPublish: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const [review, setReview] = useState<Review | null>(null)
  const [overlap, setOverlap] = useState<SourceOverlapAudit | null>(null)
  const [overlapLoading, setOverlapLoading] = useState(false)
  const [overlapError, setOverlapError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('PENDING')
  const [basis, setBasis] = useState('UNKNOWN')
  const [setHighOverlapBlocker, setSetHighOverlapBlocker] = useState(false)
  const [publishMsg, setPublishMsg] = useState<string | null>(null)
  const saveInFlight = useRef(false)

  const loadOverlap = useCallback(async () => {
    setOverlapLoading(true)
    setOverlapError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/canonical-news/${id}/source-overlap`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Overlap yüklenemedi')
      setOverlap(data.audit as SourceOverlapAudit)
    } catch (e) {
      setOverlap(null)
      setOverlapError(e instanceof Error ? e.message : 'Overlap hatası')
    } finally {
      setOverlapLoading(false)
    }
  }, [id])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/canonical-news/${id}/rights`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Yüklenemedi')
      const r = data.review as Review
      setReview(r)
      setStatus(r.rightsStatus || 'PENDING')
      if ((r.rightsStatus || 'PENDING') === 'PENDING') {
        setBasis('UNKNOWN')
      } else {
        setBasis(
          r.rightsBasis && r.rightsBasis !== 'UNKNOWN'
            ? r.rightsBasis
            : 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION'
        )
      }
      setSetHighOverlapBlocker(r.editorialBlocker === 'HIGH_SOURCE_OVERLAP')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!review) return
    void loadOverlap()
  }, [review, loadOverlap])

  async function save() {
    if (saveInFlight.current || saving) return
    if (
      !confirmRightsSave({
        status,
        risk: overlap?.risk || null,
        title: review?.title || id,
        id,
      })
    ) {
      return
    }
    saveInFlight.current = true
    setSaving(true)
    setError(null)
    setPublishMsg(null)
    try {
      const headers = await authHeaders()
      const effectiveStatus = status
      const effectiveBasis = effectiveStatus === 'PENDING' ? 'UNKNOWN' : basis
      const payload: {
        status: string
        basis: string
        editorialBlocker?: string | null
      } = { status: effectiveStatus, basis: effectiveBasis }
      if (effectiveStatus === 'REWRITE_REQUIRED') {
        payload.editorialBlocker = setHighOverlapBlocker ? 'HIGH_SOURCE_OVERLAP' : null
      }
      const res = await fetch(`/api/admin/canonical-news/${id}/rights`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Kayıt başarısız')
      const r = data.review as Review
      setReview(r)
      setStatus(r.rightsStatus || 'PENDING')
      setBasis(
        (r.rightsStatus || 'PENDING') === 'PENDING'
          ? 'UNKNOWN'
          : r.rightsBasis || 'UNKNOWN'
      )
      setSetHighOverlapBlocker(r.editorialBlocker === 'HIGH_SOURCE_OVERLAP')
      setPublishMsg('Hak kararı kaydedildi — yayınlanmadı (status draft).')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
      setPublishMsg(null)
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }

  async function publish() {
    if (deferPublish) return
    if (!review?.publishEligible) return
    const ok = window.confirm(
      `Bu taslağı yayınlamak istediğinize emin misiniz?\n\n${review.id}\n${review.title}\n\nBu işlem geri alınamaz (status → published).`
    )
    if (!ok) return
    setPublishing(true)
    setError(null)
    setPublishMsg(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/canonical-news/${id}/publish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        const blockers = Array.isArray(data.blockers) ? data.blockers.join(', ') : ''
        throw new Error([data.error || 'Yayın başarısız', blockers].filter(Boolean).join(' — '))
      }
      setReview(data.review)
      setPublishMsg(
        data.alreadyPublished
          ? 'Zaten yayında (idempotent).'
          : 'Yayınlandı. Hak alanları korundu; otomatik cohort yok.'
      )
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!review) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error || 'Kayıt bulunamadı'}
      </div>
    )
  }

  const clearDisabled = Boolean(review.editorialBlocker) || !review.availableActions.includes('CLEARED')
  const canPublish =
    !deferPublish &&
    Boolean(review.publishEligible) &&
    review.status === 'draft' &&
    review.rightsStatus === 'CLEARED' &&
    !review.editorialBlocker

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <header className="mb-4 space-y-1">
        {onToggleSelect && (
          <label className="mb-2 flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={Boolean(selected)}
              onChange={() => onToggleSelect(id)}
            />
            Seç
          </label>
        )}
        <h2 className="text-lg font-semibold text-zinc-900">{review.title}</h2>
        <p className="text-sm text-zinc-600">
          Kaynak: {review.source || '—'}
          {review.sourceUrl ? (
            <>
              {' · '}
              <a
                className="text-blue-700 underline"
                href={review.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Kaynak bağlantısı
              </a>
            </>
          ) : null}
        </p>
        <p className="text-sm font-medium text-zinc-800">
          Mevcut hak durumu:{' '}
          {RIGHTS_STATUS_TR[review.rightsStatus || 'PENDING'] || review.rightsStatus || 'PENDING'}
        </p>
        <p className="text-sm text-amber-900">
          {publicationStateTr({
            status: review.status,
            rightsStatus: review.rightsStatus,
            hasPublishedBy: review.hasPublishedBy,
          })}
        </p>
      </header>

      <dl className="mb-4 grid gap-2 text-sm md:grid-cols-2">
        <div>
          <dt className="text-zinc-500">{RIGHTS_PAGE.whyReview}</dt>
          <dd className="font-medium">
            {overlap
              ? `${RISK_TR[overlap.risk] || overlap.risk} risk · benzerlik ${pct(overlap.similarity)}`
              : overlapLoading
                ? 'Kaynak karşılaştırılıyor…'
                : 'Kaynak karşılaştırma bekleniyor'}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">{RIGHTS_PAGE.recommendedAction}</dt>
          <dd className="font-medium">
            {overlap ? riskRecommendationTr(overlap.risk) : 'İnsan incelemesi gerekir'}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Benzerlik / risk</dt>
          <dd className="font-medium">
            {overlap ? (
              <>
                {RISK_TR[overlap.risk] || overlap.risk} · {pct(overlap.similarity)}
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Editöryel engel</dt>
          <dd className="font-medium text-amber-800">
            {review.editorialBlocker
              ? 'Yüksek kaynak benzerliği engeli'
              : 'Yok'}
          </dd>
        </div>
      </dl>

      <details className="mb-4 rounded border border-zinc-200 bg-zinc-50 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-zinc-700">{RIGHTS_PAGE.techDetails}</summary>
        <dl className="mt-3 grid gap-2 md:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Haber ID</dt>
            <dd className="font-mono text-xs">{review.id}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">DB hak durumu</dt>
            <dd className="font-mono text-xs">
              {review.rightsStatus || 'PENDING'} / {review.rightsBasis || 'UNKNOWN'}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Yayın yetkisi</dt>
            <dd className="font-medium">{review.publicationAuthority || '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Aktör / köken</dt>
            <dd className="font-medium">
              approved={review.hasApprovedBy ? 'yes' : 'no'} · published=
              {review.hasPublishedBy ? 'yes' : 'no'}
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-zinc-500">Source URL</dt>
            <dd className="break-all font-mono text-xs">{review.sourceUrl || '—'}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-zinc-500">Yayın kapısı engelleri</dt>
            <dd className="font-mono text-xs text-zinc-700">
              {review.gate.blockers.length
                ? review.gate.blockers.join(', ')
                : 'none (still no auto-publish)'}
            </dd>
          </div>
          {overlap && (
            <>
              <div>
                <dt className="text-zinc-500">Risk kodu</dt>
                <dd className="font-mono text-xs">{overlap.risk}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">En uzun eşleşen bölüm</dt>
                <dd className="font-mono text-xs">
                  {overlap.maxSharedContiguousRun != null
                    ? `${overlap.maxSharedContiguousRun} tokens`
                    : '—'}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-zinc-500">Sınıflandırma</dt>
                <dd className="text-xs">{overlap.classificationReason}</dd>
              </div>
            </>
          )}
          {review.migrationBatchId && (
            <div className="md:col-span-2">
              <dt className="text-zinc-500">Batch</dt>
              <dd className="font-mono text-xs">{review.migrationBatchId}</dd>
            </div>
          )}
        </dl>
      </details>

      <div
        className={`mb-4 rounded border p-3 text-sm ${
          overlap ? riskTone(overlap.risk) : 'border-zinc-200 bg-zinc-50 text-zinc-700'
        }`}
      >
        <p className="font-semibold">{RIGHTS_PAGE.whyReview}</p>
        <p className="mt-1 text-xs opacity-80">
          Benzerlik skoru kanıttır; kesin telif ihlali değildir. Hak kararı yayın kararı değildir.
        </p>
        {overlapLoading && <p className="mt-1 text-xs">Kaynak karşılaştırılıyor…</p>}
        {overlapError && <p className="mt-1 text-xs text-red-700">{overlapError}</p>}
        {overlap && (
          <p className="mt-2 text-sm">
            Risk: <strong>{RISK_TR[overlap.risk] || overlap.risk}</strong> · Benzerlik:{' '}
            <strong>{pct(overlap.similarity)}</strong> · {riskRecommendationTr(overlap.risk)}
          </p>
        )}
      </div>

      <div className="mb-4 max-h-48 overflow-auto rounded border border-zinc-100 bg-zinc-50 p-3 text-sm whitespace-pre-wrap text-zinc-800">
        {(review.content || '').slice(0, 1200)}
        {(review.content || '').length > 1200 ? '…' : ''}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-600">Hak durumu</span>
          <select
            className="rounded border border-zinc-300 px-3 py-2"
            value={status}
            onChange={(e) => {
              const next = e.target.value
              setStatus(next)
              if (next === 'PENDING') setBasis('UNKNOWN')
              else if (basis === 'UNKNOWN') {
                setBasis('EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION')
              }
            }}
          >
            {review.availableActions.map((a) => (
              <option key={a} value={a} disabled={a === 'CLEARED' && clearDisabled}>
                {RIGHTS_STATUS_TR[a] || a}
                {a === 'CLEARED' && clearDisabled ? ' (engel var)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-600">Hak dayanağı (teknik)</span>
          <select
            className="rounded border border-zinc-300 px-3 py-2"
            value={status === 'PENDING' ? 'UNKNOWN' : basis}
            disabled={status === 'PENDING'}
            onChange={(e) => setBasis(e.target.value)}
          >
            {review.availableBases.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={saving || publishing || (status === 'CLEARED' && clearDisabled)}
          onClick={() => void save()}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Kaydediliyor…' : RIGHTS_PAGE.saveDecision}
        </button>
        <button
          type="button"
          disabled={!canPublish || saving || publishing || review.status === 'published'}
          onClick={() => void publish()}
          className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          title={
            deferPublish
              ? 'Kohort yayını ertelendi — yalnızca hak kararı'
              : canPublish
                ? 'Sunucu gate PASS — açık insan yayın komutu'
                : 'Yayın kapalı: hak/gate blocker'
          }
        >
          {publishing ? 'Yayınlanıyor…' : review.status === 'published' ? RIGHTS_PAGE.published : RIGHTS_PAGE.publish}
        </button>
      </div>

      {status === 'REWRITE_REQUIRED' && (
        <label className="mt-3 flex items-start gap-2 text-sm text-zinc-800">
          <input
            type="checkbox"
            className="mt-1"
            checked={setHighOverlapBlocker}
            onChange={(e) => setSetHighOverlapBlocker(e.target.checked)}
          />
          <span>
            Yüksek kaynak benzerliği engelini işaretle
            <span className="block text-xs text-zinc-500">
              Benzerlik skoru otomatik engel yazmaz — yalnızca bu kutuyu işaretlerseniz.
            </span>
          </span>
        </label>
      )}

      {deferPublish && (
        <p className="mt-2 text-xs text-amber-800">
          Kohort yayını ertelendi. Bu aşamada yalnızca hak kararı kaydedin; yayınlamayın.
        </p>
      )}
      {clearDisabled && (
        <p className="mt-2 text-xs text-amber-800">
          Editöryel engel aktif — “Hakları Uygun” ile yayın kapısı açılamaz. Yeniden yazım gerekir.
        </p>
      )}
      {!canPublish && review.status === 'draft' && !deferPublish && (
        <p className="mt-2 text-xs text-zinc-600">
          Yayınla kapalı — sunucu gate PASS değil. Hak kaydı ve gate gerekir.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {publishMsg && <p className="mt-2 text-sm text-emerald-800">{publishMsg}</p>}
      <p className="mt-3 text-xs text-zinc-500">
        Hak kararı yayın kararı değildir. Actor yalnızca CMS oturumundan gelir.
      </p>
    </article>
  )
}

export default function CanonicalDraftRightsPage() {
  const { user, loading } = useAuth()
  const [tick, setTick] = useState(0)
  const [filter, setFiltre] = useState<QueueFiltre>('cohort1')
  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [progress, setProgress] = useState<BatchRightsProgress | null>(null)
  const [sortStatus, setSortStatus] = useState<string | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [firstTwo, setFirstTwo] = useState<string[]>([])
  const [finalizeBusy, setFinalizeBusy] = useState(false)
  const [finalizeMsg, setFinalizeMsg] = useState<string | null>(null)
  const [finalizeErr, setFinalizeErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFiltre, setStatusFiltre] = useState<StatusFiltre>('all')
  const [riskFiltre, setRiskFiltre] = useState<RiskFiltre>('all')
  const [sourceFiltre, setSourceFiltre] = useState('all')
  const [groupBySource, setGroupBySource] = useState(false)

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runBulk(status: 'REWRITE_REQUIRED' | 'DO_NOT_PUBLISH' | 'PENDING') {
    const ids = [...selected].slice(0, BULK_MAX)
    if (!ids.length || bulkBusy) return
    const label = RIGHTS_STATUS_TR[status] || status
    const ok = window.confirm(
      [
        RIGHTS_PAGE.bulkConfirmTitle,
        '',
        `${ids.length} haber seçildi.`,
        `Bu işlem ${ids.length} haberi “${label}” olarak işaretleyecek.`,
        'Hiçbir haber yayınlanmayacak.',
        RIGHTS_PAGE.noBulkPublish,
        '',
        'Devam?',
      ].join('\n')
    )
    if (!ok) return
    setBulkBusy(true)
    setBulkMsg(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/canonical-news/rights-bulk', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ids,
          status,
          basis:
            status === 'PENDING'
              ? 'UNKNOWN'
              : 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
          editorialBlocker: status === 'REWRITE_REQUIRED' ? 'HIGH_SOURCE_OVERLAP' : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Toplu işlem başarısız')
      const s = data.summary || {}
      const reasons = Array.isArray(data.results)
        ? (data.results as Array<{ id: string; ok?: boolean; skipped?: boolean; error?: string }>)
            .filter((r) => r.error || r.skipped)
            .slice(0, 8)
            .map((r) => `${r.id}: ${r.error || 'atlandı'}`)
            .join(' · ')
        : ''
      setBulkMsg(
        `Başarılı: ${s.success ?? 0} · Atlandı: ${s.skipped ?? 0} · Başarısız: ${s.failed ?? 0}${
          reasons ? ` · ${reasons}` : ''
        }`
      )
      setSelected(new Set())
      setTick((t) => t + 1)
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : 'Toplu işlem hatası')
    } finally {
      setBulkBusy(false)
    }
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const headers = await authHeaders()
        const qs =
          filter === 'cohort1' ? `?batch=${encodeURIComponent(P18_4E_COHORT1_BATCH_ID)}` : ''
        const res = await fetch(`/api/admin/canonical-news/rights-queue${qs}`, { headers })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Kuyruk yüklenemedi')
        if (cancelled) return

        const rawQueue: QueueItem[] = Array.isArray(data.queue)
          ? (data.queue as QueueItem[]).filter((q) => q?.id)
          : PILOT_IDS.map((id) => ({ id, kind: 'pilot' as const }))

        if (data.progress) setProgress(data.progress as BatchRightsProgress)
        else setProgress(null)

        if (filter !== 'cohort1') {
          setQueueItems(rawQueue.length ? rawQueue : PILOT_IDS.map((id) => ({ id, kind: 'pilot' })))
          setSortStatus(null)
          setFirstTwo([])
          setQueueError(null)
          return
        }

        setSortStatus('Risk sıralanıyor…')
        const audits = await Promise.all(
          rawQueue.map(async (item) => {
            try {
              const r = await fetch(`/api/admin/canonical-news/${item.id}/source-overlap`, {
                headers,
              })
              const j = await r.json()
              if (!r.ok) throw new Error(j.error || 'overlap_failed')
              return {
                ...item,
                risk: (j.audit?.risk as string) || 'SOURCE_NOT_EVALUABLE',
                finalWeightedScore:
                  typeof j.audit?.similarity === 'number' ? j.audit.similarity : null,
              }
            } catch {
              return {
                ...item,
                risk: 'SOURCE_NOT_EVALUABLE',
                finalWeightedScore: null as number | null,
              }
            }
          })
        )
        if (cancelled) return
        const orderedIds = sortRightsReviewQueueByRisk(audits)
        const byId = new Map(audits.map((a) => [a.id, a]))
        const ordered = orderedIds.map((id) => byId.get(id)!).filter(Boolean)
        setQueueItems(ordered)
        setFirstTwo(orderedIds.slice(0, 2))
        setSortStatus(`Sıra hazır · ${ordered.length} kayıt`)
        setQueueError(null)
      } catch (e) {
        if (!cancelled) {
          setQueueItems(filter === 'cohort1' ? [] : PILOT_IDS.map((id) => ({ id, kind: 'pilot' })))
          setQueueError(e instanceof Error ? e.message : 'Kuyruk hatası')
          setSortStatus(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, tick, filter])

  async function finalizeCohort1() {
    if (finalizeBusy) return
    const ok = window.confirm(
      [
        'Kohort #1 — toplu yeniden yazılmalı',
        '',
        'Tüm kohort kayıtları “Yeniden Yazılmalı” yapılacak.',
        'Yayın yok. Actor = CMS oturumunuz.',
        '',
        'Devam?',
      ].join('\n')
    )
    if (!ok) return
    setFinalizeBusy(true)
    setFinalizeErr(null)
    setFinalizeMsg(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/canonical-news/rights-queue/finalize-cohort', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          confirm: 'REWRITE_REQUIRED_COHORT_1',
          batch: P18_4E_COHORT1_BATCH_ID,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? `${data.error}${data.detail ? `: ${data.detail}` : ''}`
            : 'Finalize failed'
        )
      }
      setFinalizeMsg(
        `Tamam: yeniden yazılmalı=${data.rewriteRequired} · yayın=${data.published ?? 0}`
      )
      setTick((t) => t + 1)
    } catch (e) {
      setFinalizeErr(e instanceof Error ? e.message : 'Finalize hatası')
    } finally {
      setFinalizeBusy(false)
    }
  }

  const sourceOptions = useMemo(() => {
    const set = new Set<string>()
    for (const q of queueItems) {
      const s = (q.source || '').trim()
      if (s) set.add(s)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'))
  }, [queueItems])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR')
    return queueItems.filter((item) => {
      if (statusFiltre !== 'all') {
        const rs = (item.rightsStatus || 'PENDING').toUpperCase()
        if (rs !== statusFiltre) return false
      }
      if (riskFiltre !== 'all' && (item.risk || '') !== riskFiltre) return false
      if (sourceFiltre !== 'all' && (item.source || '') !== sourceFiltre) return false
      if (!q) return true
      const hay = [item.id, item.title || '', item.source || '', item.sourceUrl || '']
        .join(' ')
        .toLocaleLowerCase('tr-TR')
      return hay.includes(q)
    })
  }, [queueItems, search, statusFiltre, riskFiltre, sourceFiltre])

  const displayGroups = useMemo(() => {
    if (!groupBySource) return [{ key: '__all__', label: null as string | null, items: filteredItems }]
    const map = new Map<string, QueueItem[]>()
    for (const item of filteredItems) {
      const key = (item.source || '').trim() || 'Kaynak belirtilmemiş'
      const list = map.get(key) || []
      list.push(item)
      map.set(key, list)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
      .map(([key, items]) => ({ key, label: key, items }))
  }, [filteredItems, groupBySource])

  const visibleIds = useMemo(() => filteredItems.map((i) => i.id), [filteredItems])

  const progressLine = useMemo(() => {
    if (!progress) return null
    return `Toplam: ${progress.total} · ${RIGHTS_STATUS_TR.PENDING}: ${progress.pending} · ${RIGHTS_STATUS_TR.CLEARED}: ${progress.cleared} · ${RIGHTS_STATUS_TR.REWRITE_REQUIRED}: ${progress.rewriteRequired} · ${RIGHTS_STATUS_TR.DO_NOT_PUBLISH}: ${progress.doNotPublish} · Yayında: ${progress.published}`
  }, [progress])

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <div className="p-8 text-center text-zinc-600">CMS oturumu gerekli</div>
  }

  const canFinalize =
    filter === 'cohort1' &&
    progress &&
    progress.total === 10 &&
    progress.pending === 10 &&
    progress.rewriteRequired === 0 &&
    progress.cleared === 0 &&
    progress.published === 0

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">{RIGHTS_PAGE.title}</h1>
        <p className="mt-2 text-sm text-zinc-700">{RIGHTS_PAGE.subtitle}</p>
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {RIGHTS_PAGE.rightsVsPublish}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-zinc-600">Kohort</span>
            <select
              className="rounded border border-zinc-300 px-2 py-1"
              value={filter}
              onChange={(e) => setFiltre(e.target.value as QueueFiltre)}
            >
              <option value="cohort1">Kohort #1</option>
              <option value="all">Tümü</option>
            </select>
          </label>
          {filter === 'cohort1' && (
            <button
              type="button"
              disabled={!canFinalize || finalizeBusy}
              onClick={() => void finalizeCohort1()}
              className="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {finalizeBusy
                ? 'İşleniyor…'
                : 'Kohort #1 → Yeniden yazılmalı (yayın yok)'}
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-zinc-600">Ara</span>
            <input
              className="rounded border border-zinc-300 px-3 py-2"
              placeholder={RIGHTS_PAGE.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600">{RIGHTS_PAGE.filterStatus}</span>
            <select
              className="rounded border border-zinc-300 px-2 py-1.5"
              value={statusFiltre}
              onChange={(e) => setStatusFiltre(e.target.value as StatusFiltre)}
            >
              <option value="all">Tümü</option>
              <option value="PENDING">{RIGHTS_STATUS_TR.PENDING}</option>
              <option value="REWRITE_REQUIRED">{RIGHTS_STATUS_TR.REWRITE_REQUIRED}</option>
              <option value="DO_NOT_PUBLISH">{RIGHTS_STATUS_TR.DO_NOT_PUBLISH}</option>
              <option value="CLEARED">{RIGHTS_STATUS_TR.CLEARED}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600">{RIGHTS_PAGE.filterRisk}</span>
            <select
              className="rounded border border-zinc-300 px-2 py-1.5"
              value={riskFiltre}
              onChange={(e) => setRiskFiltre(e.target.value as RiskFiltre)}
            >
              <option value="all">Tümü</option>
              <option value="HIGH_SOURCE_OVERLAP">{RISK_TR.HIGH_SOURCE_OVERLAP}</option>
              <option value="MEDIUM_OVERLAP">{RISK_TR.MEDIUM_OVERLAP}</option>
              <option value="LOW_OVERLAP">{RISK_TR.LOW_OVERLAP}</option>
              <option value="SOURCE_NOT_EVALUABLE">{RISK_TR.SOURCE_NOT_EVALUABLE}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600">{RIGHTS_PAGE.filterSource}</span>
            <select
              className="rounded border border-zinc-300 px-2 py-1.5"
              value={sourceFiltre}
              onChange={(e) => setSourceFiltre(e.target.value)}
            >
              <option value="all">Tümü</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={groupBySource}
              onChange={(e) => setGroupBySource(e.target.checked)}
            />
            {RIGHTS_PAGE.groupBySource}
          </label>
        </div>

        {progressLine && (
          <p className="mt-3 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-800">
            {progressLine}
          </p>
        )}
        {sortStatus && <p className="mt-2 text-xs text-zinc-600">{sortStatus}</p>}
        {firstTwo.length === 2 && (
          <p className="mt-1 font-mono text-xs text-zinc-500">
            İlk iki (risk sırası): {firstTwo[0]} → {firstTwo[1]}
          </p>
        )}
        {finalizeMsg && <p className="mt-2 text-sm text-emerald-800">{finalizeMsg}</p>}
        {finalizeErr && <p className="mt-2 text-sm text-red-700">{finalizeErr}</p>}
        {queueError && (
          <p className="mt-2 text-xs text-amber-800">Kuyruk API: {queueError}</p>
        )}
      </header>

      {visibleIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-zinc-200 bg-white p-3 text-sm">
          <button
            type="button"
            className="rounded border px-2 py-1"
            onClick={() => setSelected(new Set(visibleIds.slice(0, BULK_MAX)))}
          >
            {RIGHTS_PAGE.selectVisible} ({Math.min(visibleIds.length, BULK_MAX)})
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1"
            onClick={() => setSelected(new Set())}
          >
            {RIGHTS_PAGE.clearSelection}
          </button>
          <span className="text-zinc-600">
            {selected.size} seçili (en fazla {BULK_MAX})
          </span>
          <button
            type="button"
            disabled={!selected.size || bulkBusy}
            className="rounded bg-amber-700 px-2 py-1 text-white disabled:opacity-50"
            onClick={() => void runBulk('REWRITE_REQUIRED')}
          >
            {RIGHTS_PAGE.bulkRewrite}
          </button>
          <button
            type="button"
            disabled={!selected.size || bulkBusy}
            className="rounded bg-red-800 px-2 py-1 text-white disabled:opacity-50"
            onClick={() => void runBulk('DO_NOT_PUBLISH')}
          >
            {RIGHTS_PAGE.bulkDoNotPublish}
          </button>
          <button
            type="button"
            disabled={!selected.size || bulkBusy}
            className="rounded bg-zinc-700 px-2 py-1 text-white disabled:opacity-50"
            onClick={() => void runBulk('PENDING')}
          >
            {RIGHTS_PAGE.bulkPending}
          </button>
          {bulkMsg && <p className="w-full text-xs text-zinc-700">{bulkMsg}</p>}
        </div>
      )}

      {queueItems.length === 0 && !queueError && (
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin" /> {RIGHTS_PAGE.loading}
        </div>
      )}

      {queueItems.length > 0 && filteredItems.length === 0 && (
        <p className="text-sm text-zinc-600">{RIGHTS_PAGE.empty}</p>
      )}

      {displayGroups.map((group) => (
        <section key={group.key} className="space-y-4">
          {group.label && (
            <h2 className="border-b border-zinc-200 pb-1 text-sm font-semibold text-zinc-800">
              Kaynak: {group.label} ({group.items.length})
            </h2>
          )}
          {group.items.map((item) => (
            <PilotCard
              key={`${item.id}-${tick}-${filter}`}
              id={item.id}
              deferPublish={filter === 'cohort1'}
              selected={selected.has(item.id)}
              onToggleSelect={toggleSelect}
              onSaved={() => setTick((t) => t + 1)}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

