'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'
import {
  P18_4E_COHORT1_BATCH_ID,
  sortRightsReviewQueueByRisk,
  type BatchRightsProgress,
} from '@/services/editorial/canonicalRightsReviewQueue'

const PILOT_IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

type QueueFilter = 'all' | 'cohort1'

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
          'HIGH similarity uyarısı',
          '',
          'Similarity evidence is NOT copyright clearance.',
          'Final weighted score is HIGH — you are making an explicit human CLEARED decision.',
          '',
          opts.id,
          opts.title,
          '',
          'Bu işlem yayınlamaz. Devam?',
        ].join('\n')
      : [
          'CLEARED onayı',
          '',
          'Similarity evidence is NOT copyright clearance.',
          'Human reviewer is making this decision.',
          '',
          opts.id,
          opts.title,
          '',
          'Bu işlem yayınlamaz. Devam?',
        ].join('\n')
    return window.confirm(msg)
  }
  if (opts.status === 'DO_NOT_PUBLISH') {
    return window.confirm(
      [
        'DO_NOT_PUBLISH onayı',
        '',
        'Article will remain auditable (not deleted).',
        'Status stays draft; publish remains blocked.',
        '',
        opts.id,
        opts.title,
        '',
        'Devam?',
      ].join('\n')
    )
  }
  if (opts.status === 'REWRITE_REQUIRED') {
    return window.confirm(
      [
        'REWRITE_REQUIRED onayı',
        '',
        'Human decision only — similarity HIGH does not auto-write blockers.',
        opts.id,
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
}: {
  id: string
  onSaved: () => void
  /** P18.4E.3: cohort publish deferred — keep button disabled. */
  deferPublish: boolean
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
        <p className="font-mono text-xs text-zinc-500">{review.id}</p>
        <h2 className="text-lg font-semibold text-zinc-900">{review.title}</h2>
        <p className="text-sm text-zinc-600">
          {review.source} · {review.bodyLen} karakter · status={review.status}
          {review.migrationBatchId ? ` · batch=${review.migrationBatchId}` : ''}
        </p>
      </header>

      <dl className="mb-4 grid gap-2 text-sm md:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Publication authority</dt>
          <dd className="font-medium">{review.publicationAuthority || '—'}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Actor provenance</dt>
          <dd className="font-medium">
            approved={review.hasApprovedBy ? 'yes' : 'no'} · published=
            {review.hasPublishedBy ? 'yes' : 'no'}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Rights</dt>
          <dd className="font-medium">
            {review.rightsStatus || 'PENDING'} / {review.rightsBasis || 'UNKNOWN'}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Editorial blocker</dt>
          <dd className="font-medium text-amber-800">{review.editorialBlocker || 'none'}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-zinc-500">Source URL</dt>
          <dd>
            {review.sourceUrl ? (
              <a
                className="break-all text-blue-700 underline"
                href={review.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {review.sourceUrl}
              </a>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-zinc-500">Publish gate blockers</dt>
          <dd className="font-mono text-xs text-zinc-700">
            {review.gate.blockers.length ? review.gate.blockers.join(', ') : 'none (still no auto-publish)'}
          </dd>
        </div>
      </dl>

      <div
        className={`mb-4 rounded border p-3 text-sm ${
          overlap ? riskTone(overlap.risk) : 'border-zinc-200 bg-zinc-50 text-zinc-700'
        }`}
      >
        <p className="font-semibold">Source-overlap audit (non-AI, evidence only)</p>
        <p className="mt-1 text-xs opacity-80">
          Similarity risk ≠ DB editorial blocker. Final weighted score drives risk; max shared run is
          EVIDENCE_ONLY.
        </p>
        {overlapLoading && <p className="mt-1 text-xs">Kaynak karşılaştırılıyor…</p>}
        {overlapError && <p className="mt-1 text-xs text-red-700">{overlapError}</p>}
        {overlap && (
          <dl className="mt-2 grid gap-1 md:grid-cols-2">
            <div>
              <dt className="text-xs opacity-70">Similarity risk</dt>
              <dd className="font-mono font-semibold">{overlap.risk}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">DB editorial blocker</dt>
              <dd className="font-mono font-semibold">{review.editorialBlocker || 'None'}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Final weighted score</dt>
              <dd className="font-mono font-semibold">{pct(overlap.similarity)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Classification reason</dt>
              <dd className="font-mono text-xs">{overlap.classificationReason || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Jaccard (component)</dt>
              <dd className="font-mono">{pct(overlap.jaccard)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">3-gram overlap (component)</dt>
              <dd className="font-mono">{pct(overlap.ngram3)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Token match (component)</dt>
              <dd className="font-mono">{pct(overlap.tokenMatchRatio)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Max shared run (EVIDENCE_ONLY)</dt>
              <dd className="font-mono">
                {overlap.maxSharedContiguousRun != null
                  ? `${overlap.maxSharedContiguousRun} tokens`
                  : '—'}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className="mb-4 max-h-48 overflow-auto rounded border border-zinc-100 bg-zinc-50 p-3 text-sm whitespace-pre-wrap text-zinc-800">
        {(review.content || '').slice(0, 1200)}
        {(review.content || '').length > 1200 ? '…' : ''}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-600">Rights status</span>
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
                {a}
                {a === 'CLEARED' && clearDisabled ? ' (blocked)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-600">Rights basis</span>
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
          {saving ? 'Kaydediliyor…' : 'Kararı kaydet'}
        </button>
        <button
          type="button"
          disabled={!canPublish || saving || publishing || review.status === 'published'}
          onClick={() => void publish()}
          className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          title={
            deferPublish
              ? 'P18.4E.3: cohort publish deferred — rights only'
              : canPublish
                ? 'Sunucu gate PASS — açık insan yayın komutu'
                : 'Yayın kapalı: hak/gate blocker'
          }
        >
          {publishing ? 'Yayınlanıyor…' : review.status === 'published' ? 'Yayında' : 'Yayınla'}
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
            Human set editorial blocker: <span className="font-mono">HIGH_SOURCE_OVERLAP</span>
            <span className="block text-xs text-zinc-500">
              Not auto-written from similarity=HIGH — only if you check this box.
            </span>
          </span>
        </label>
      )}

      {deferPublish && (
        <p className="mt-2 text-xs text-amber-800">
          P18.4E.3: Cohort publish deferred. Save rights only; do not publish in this phase.
        </p>
      )}
      {clearDisabled && (
        <p className="mt-2 text-xs text-amber-800">
          Editorial blocker aktif — CLEAR ile yayın kapısı açılamaz. Yeniden yazım gerekir.
        </p>
      )}
      {!canPublish && review.status === 'draft' && !deferPublish && (
        <p className="mt-2 text-xs text-zinc-600">
          Yayınla kapalı — sunucu `publishEligible=false`. Hak kaydı ve gate PASS gerekir.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {publishMsg && <p className="mt-2 text-sm text-emerald-800">{publishMsg}</p>}
      <p className="mt-3 text-xs text-zinc-500">
        Hak kaydı otomatik yayınlamaz. Actor yalnızca CMS oturumundan gelir (client UID yok sayılır).
      </p>
    </article>
  )
}

export default function CanonicalDraftRightsPage() {
  const { user, loading } = useAuth()
  const [tick, setTick] = useState(0)
  const [filter, setFilter] = useState<QueueFilter>('cohort1')
  const [queueIds, setQueueIds] = useState<string[]>([])
  const [progress, setProgress] = useState<BatchRightsProgress | null>(null)
  const [sortStatus, setSortStatus] = useState<string | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [firstTwo, setFirstTwo] = useState<string[]>([])

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

        const rawIds = Array.isArray(data.queue)
          ? (data.queue as Array<{ id: string }>).map((q) => q.id).filter(Boolean)
          : [...PILOT_IDS]

        if (data.progress) setProgress(data.progress as BatchRightsProgress)
        else setProgress(null)

        if (filter !== 'cohort1') {
          setQueueIds(rawIds.length ? rawIds : [...PILOT_IDS])
          setSortStatus(null)
          setFirstTwo([])
          setQueueError(null)
          return
        }

        setSortStatus('Similarity risk sıralanıyor (MEDIUM → HIGH ascending)…')
        const audits = await Promise.all(
          rawIds.map(async (id) => {
            try {
              const r = await fetch(`/api/admin/canonical-news/${id}/source-overlap`, { headers })
              const j = await r.json()
              if (!r.ok) throw new Error(j.error || 'overlap_failed')
              return {
                id,
                risk: (j.audit?.risk as string) || 'SOURCE_NOT_EVALUABLE',
                finalWeightedScore:
                  typeof j.audit?.similarity === 'number' ? j.audit.similarity : null,
              }
            } catch {
              return { id, risk: 'SOURCE_NOT_EVALUABLE', finalWeightedScore: null }
            }
          })
        )
        if (cancelled) return
        const ordered = sortRightsReviewQueueByRisk(audits)
        setQueueIds(ordered)
        setFirstTwo(ordered.slice(0, 2))
        setSortStatus(
          `Sıra hazır: MEDIUM first, HIGH ascending · ${ordered.length} cards`
        )
        setQueueError(null)
      } catch (e) {
        if (!cancelled) {
          setQueueIds(filter === 'cohort1' ? [] : [...PILOT_IDS])
          setQueueError(e instanceof Error ? e.message : 'Kuyruk hatası')
          setSortStatus(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, tick, filter])

  const progressLine = useMemo(() => {
    if (!progress) return null
    return `Total: ${progress.total} · Pending: ${progress.pending} · Cleared: ${progress.cleared} · Rewrite required: ${progress.rewriteRequired} · Do not publish: ${progress.doNotPublish} · Published: ${progress.published}`
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Canonical draft rights review</h1>
        <p className="mt-1 text-sm text-zinc-600">
          P18.4E.3 — human rights decision session. Auto-clear / auto-publish / AI yok. Cohort #1
          yayın bu fazda kapalı.
        </p>
        <p className="mt-1 font-mono text-xs text-zinc-500">/admin/canonical-drafts/rights</p>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-zinc-600">Filter</span>
            <select
              className="rounded border border-zinc-300 px-2 py-1"
              value={filter}
              onChange={(e) => setFilter(e.target.value as QueueFilter)}
            >
              <option value="cohort1">Cohort #1 · {P18_4E_COHORT1_BATCH_ID}</option>
              <option value="all">All (pilots + cohort)</option>
            </select>
          </label>
        </div>

        {progressLine && (
          <p className="mt-3 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800">
            {progressLine}
          </p>
        )}
        {sortStatus && <p className="mt-2 text-xs text-zinc-600">{sortStatus}</p>}
        {firstTwo.length === 2 && (
          <p className="mt-1 font-mono text-xs text-zinc-500">
            First two (MEDIUM ascending): {firstTwo[0]} → {firstTwo[1]}
          </p>
        )}
        {queueError && (
          <p className="mt-2 text-xs text-amber-800">Kuyruk API: {queueError}</p>
        )}
      </header>

      {queueIds.length === 0 && !queueError && (
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Kuyruk yükleniyor…
        </div>
      )}

      {queueIds.map((id) => (
        <PilotCard
          key={`${id}-${tick}-${filter}`}
          id={id}
          deferPublish={filter === 'cohort1'}
          onSaved={() => setTick((t) => t + 1)}
        />
      ))}
    </div>
  )
}
