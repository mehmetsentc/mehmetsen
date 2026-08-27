'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Check, X } from 'lucide-react'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { ROUTES } from '@/constants/routes'
import { auth } from '@/lib/firebase/auth'
import type {
  PublisherClaimRequestRecord,
  PublisherRecord,
  PublisherSourceRecord,
} from '@/types/publisher'
import toast from 'react-hot-toast'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AdminPublisherDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [publisher, setPublisher] = useState<PublisherRecord | null>(null)
  const [sources, setSources] = useState<
    Array<PublisherSourceRecord & { sourceName: string; sourceDomain: string }>
  >([])
  const [claims, setClaims] = useState<PublisherClaimRequestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [rejectReason, setRejectReason] = useState('')
  const [acting, setActing] = useState<string | null>(null)
  const [grantingPilot, setGrantingPilot] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/publishers?id=${encodeURIComponent(id)}`, {
        headers: await authHeaders(),
      })
      const body = (await res.json()) as {
        publisher?: PublisherRecord
        sources?: typeof sources
        claims?: PublisherClaimRequestRecord[]
        error?: string
      }
      if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
      setPublisher(body.publisher ?? null)
      setSources(body.sources ?? [])
      setClaims(body.claims ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Detay yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const approve = async (claimId: string) => {
    setActing(claimId)
    try {
      const res = await fetch(`/api/admin/publishers/claims/${claimId}/approve`, {
        method: 'POST',
        headers: await authHeaders(),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Onay başarısız')
      toast.success('Talep onaylandı — yayın doğrulandı')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Onay başarısız')
    } finally {
      setActing(null)
    }
  }

  const reject = async (claimId: string) => {
    if (!rejectReason.trim()) {
      toast.error('Red nedeni gerekli')
      return
    }
    setActing(claimId)
    try {
      const res = await fetch(`/api/admin/publishers/claims/${claimId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ rejectionReason: rejectReason.trim() }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Red başarısız')
      toast.success('Talep reddedildi')
      setRejectReason('')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Red başarısız')
    } finally {
      setActing(null)
    }
  }

  const grantPilotBundle = async () => {
    if (!id) return
    setGrantingPilot(true)
    try {
      const res = await fetch(`/api/admin/publishers/${encodeURIComponent(id)}/feature-access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ grantPilotBundle: true, note: 'P11 pilot cohort' }),
      })
      const body = (await res.json()) as { error?: string; granted?: number }
      if (!res.ok) throw new Error(body.error || 'Allowlist başarısız')
      toast.success(`Pilot allowlist: ${body.granted ?? 0} özellik`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Allowlist başarısız')
    } finally {
      setGrantingPilot(false)
    }
  }

  if (loading) {
    return (
      <AdminOsPageShell title="Publisher" subtitle="Yükleniyor…">
        <p className="text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</p>
      </AdminOsPageShell>
    )
  }

  if (!publisher) {
    return (
      <AdminOsPageShell title="Publisher" subtitle="Bulunamadı">
        <Link href={ROUTES.ADMIN.PUBLISHERS} className="text-sm text-[rgb(var(--color-brand))]">
          ← Listeye dön
        </Link>
      </AdminOsPageShell>
    )
  }

  const pendingClaims = claims.filter((c) => c.status === 'PENDING')

  return (
    <AdminOsPageShell title={publisher.displayName} subtitle={`ID: ${publisher.id}`}>
      <Link
        href={ROUTES.ADMIN.PUBLISHERS}
        className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-[rgb(var(--color-brand))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Publisherlar
      </Link>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[rgb(var(--color-border))] p-4">
          <h2 className="mb-2 font-bold">Bilgi</h2>
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="text-[rgb(var(--color-muted))]">Slug</dt>
              <dd>{publisher.slug}</dd>
            </div>
            <div>
              <dt className="text-[rgb(var(--color-muted))]">Durum</dt>
              <dd>
                {publisher.status} / {publisher.verificationStatus}
              </dd>
            </div>
            <div>
              <dt className="text-[rgb(var(--color-muted))]">Domain</dt>
              <dd>{publisher.primaryDomain ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[rgb(var(--color-muted))]">Profil</dt>
              <dd>
                <a
                  href={ROUTES.PUBLISHER(publisher.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[rgb(var(--color-brand))] hover:underline"
                >
                  /publisher/{publisher.slug}
                </a>
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-xl border border-[rgb(var(--color-border))] p-4">
          <h2 className="mb-2 font-bold">Bağlı kaynaklar ({sources.length})</h2>
          <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
            {sources.length === 0 ? (
              <li className="text-[rgb(var(--color-muted))]">Kaynak yok</li>
            ) : (
              sources.map((s) => (
                <li key={s.id} className="border-b border-[rgb(var(--color-border))]/50 pb-2">
                  <span className="font-semibold">{s.sourceName}</span>
                  <span className="ml-2 text-xs text-[rgb(var(--color-muted))]">
                    {s.sourceDomain}
                    {s.isPrimary ? ' · birincil' : ''}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <section className="mb-8 rounded-xl border border-[rgb(var(--color-border))] p-4">
        <h2 className="mb-2 font-bold">P11 Pilot allowlist</h2>
        <p className="mb-3 text-sm text-[rgb(var(--color-muted))]">
          Global flag açmadan Studio/Content/Ads özelliklerini bu yayıncıya verir. Yalnızca VERIFIED
          yayıncılar için reklam özellikleri. Ödeme yok.
        </p>
        <button
          type="button"
          disabled={grantingPilot || publisher.verificationStatus !== 'VERIFIED'}
          onClick={() => void grantPilotBundle()}
          className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {grantingPilot ? 'Veriliyor…' : 'Pilot paketini ver'}
        </button>
        {publisher.verificationStatus !== 'VERIFIED' ? (
          <p className="mt-2 text-xs text-amber-600">Önce claim onaylayıp VERIFIED yapın.</p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Sahiplik talepleri</h2>
        {pendingClaims.length === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Bekleyen talep yok.</p>
        ) : (
          <ul className="space-y-4">
            {pendingClaims.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-[rgb(var(--color-border))] p-4"
              >
                <p className="text-sm">
                  <span className="font-semibold">Kullanıcı:</span> {c.userId}
                </p>
                {c.businessEmail && (
                  <p className="text-sm text-[rgb(var(--color-muted))]">E-posta: {c.businessEmail}</p>
                )}
                {c.requestedDomain && (
                  <p className="text-sm text-[rgb(var(--color-muted))]">Domain: {c.requestedDomain}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={acting === c.id}
                    onClick={() => void approve(c.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    Onayla
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="Red gerekçesi"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="min-w-[200px] flex-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={acting === c.id}
                    onClick={() => void reject(c.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/50 px-3 py-1.5 text-sm font-semibold text-red-600 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Reddet
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminOsPageShell>
  )
}
