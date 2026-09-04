'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'

const PILOT_IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

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
  gate: {
    publishable: boolean
    blockers: string[]
    executePublish: false
  }
  availableActions: string[]
  availableBases: string[]
}

async function authHeaders(): Promise<HeadersInit> {
  const { getAuth } = await import('firebase/auth')
  const user = getAuth().currentUser
  if (!user) throw new Error('Oturum gerekli')
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function PilotCard({
  id,
  onSaved,
}: {
  id: string
  onSaved: () => void
}) {
  const [review, setReview] = useState<Review | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('PENDING')
  const [basis, setBasis] = useState('EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION')

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
      setBasis(
        r.rightsBasis && r.rightsBasis !== 'UNKNOWN'
          ? r.rightsBasis
          : 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/canonical-news/${id}/rights`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status, basis }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kayıt başarısız')
      setReview(data.review)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    } finally {
      setSaving(false)
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

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <header className="mb-4 space-y-1">
        <p className="font-mono text-xs text-zinc-500">{review.id}</p>
        <h2 className="text-lg font-semibold text-zinc-900">{review.title}</h2>
        <p className="text-sm text-zinc-600">
          {review.source} · {review.bodyLen} karakter · status={review.status}
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
            onChange={(e) => setStatus(e.target.value)}
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
            value={basis}
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
          disabled={saving || (status === 'CLEARED' && clearDisabled)}
          onClick={() => void save()}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Kaydediliyor…' : 'Kararı kaydet'}
        </button>
      </div>

      {clearDisabled && (
        <p className="mt-2 text-xs text-amber-800">
          Editorial blocker aktif — CLEAR ile yayın kapısı açılamaz. Yeniden yazım gerekir.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <p className="mt-3 text-xs text-zinc-500">
        Bu ekran yayınlamaz. Gate yeşil olsa bile P18.4D.2 otomatik publish etmez.
      </p>
    </article>
  )
}

export default function CanonicalDraftRightsPage() {
  const { user, loading } = useAuth()
  const [tick, setTick] = useState(0)

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
          P18.4D.2 — yalnızca insan editör hak kararı. Otomatik yayın yok. Candidate 2 rewrite
          blocker ile CLEAR edilemez.
        </p>
        <p className="mt-1 font-mono text-xs text-zinc-500">/admin/canonical-drafts/rights</p>
      </header>

      {PILOT_IDS.map((id) => (
        <PilotCard key={`${id}-${tick}`} id={id} onSaved={() => setTick((t) => t + 1)} />
      ))}
    </div>
  )
}
