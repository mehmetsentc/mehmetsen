'use client'

import { useCallback, useEffect, useState } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { auth } from '@/lib/firebase/auth'
import { Download, Mail, RefreshCw, Search, UserMinus, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'

interface SubscriberRow {
  id: string
  email: string
  status: string
  source: string
  marketingConsent: boolean
  subscribedAt: string | null
  unsubscribedAt: string | null
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  })
}

const SOURCE_LABELS: Record<string, string> = {
  'desktop-home': 'Ana sayfa',
  article: 'Haber',
  'article-prompt': 'Haber (öneri)',
  'city-footer': 'Şehir footer',
  'city-home': 'Şehir ana sayfa',
  'bulten-page': 'Bülten sayfası',
}

export default function NewsletterAdminPage() {
  const { can, loading: authLoading } = useCmsAuth()
  const [items, setItems] = useState<SubscriberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'active' | 'unsubscribed' | 'all'>('active')
  const [search, setSearch] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [counts, setCounts] = useState({ active: 0, unsubscribed: 0 })
  const [actionId, setActionId] = useState<string | null>(null)

  const load = useCallback(
    async (reset = true, cursor?: string | null) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ status })
        if (search.trim()) params.set('q', search.trim())
        if (!reset && cursor) params.set('cursor', cursor)
        const res = await authFetch(`/api/admin/newsletter?${params}`)
        if (!res.ok) {
          toast.error('Liste yüklenemedi')
          return
        }
        const data = (await res.json()) as {
          items: SubscriberRow[]
          nextCursor: string | null
          counts: { active: number; unsubscribed: number }
        }
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]))
        setNextCursor(data.nextCursor)
        setCounts(data.counts)
      } catch {
        toast.error('Bağlantı hatası')
      } finally {
        setLoading(false)
      }
    },
    [status, search]
  )

  useEffect(() => {
    if (authLoading) return
    if (!can('users:read')) return
    void load(true)
  }, [authLoading, can, load, status])

  const handleAction = async (row: SubscriberRow, action: 'unsubscribe' | 'reactivate') => {
    setActionId(row.id)
    try {
      const res = await authFetch('/api/admin/newsletter', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action }),
      })
      if (!res.ok) {
        toast.error('İşlem başarısız')
        return
      }
      toast.success(action === 'unsubscribe' ? 'Abonelik iptal edildi' : 'Yeniden aktif')
      void load(true)
    } finally {
      setActionId(null)
    }
  }

  const exportCsv = async () => {
    try {
      const res = await authFetch('/api/admin/newsletter?format=csv')
      if (!res.ok) {
        toast.error('CSV indirilemedi')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'nahaber-bulten.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('CSV indirilemedi')
    }
  }

  if (!authLoading && !can('users:read')) {
    return (
      <div className="p-6 text-sm text-[rgb(var(--color-muted))]">
        Bu sayfayı görüntüleme yetkiniz yok.
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <CMSHeader
        title="E-posta Bülteni"
        subtitle="Güncel haberlere abone olan mail listesi"
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm">
            <Mail className="h-4 w-4 text-[rgb(var(--color-brand))]" />
            <span className="font-semibold text-[rgb(var(--color-text))]">{counts.active}</span>
            <span className="text-[rgb(var(--color-muted))]">aktif</span>
            <span className="text-[rgb(var(--color-border))]">·</span>
            <span className="text-[rgb(var(--color-muted))]">{counts.unsubscribed} iptal</span>
          </div>
          <button
            type="button"
            onClick={() => void exportCsv()}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm font-medium text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-nav-hover))]"
          >
            <Download className="h-4 w-4" />
            CSV indir
          </button>
          <button
            type="button"
            onClick={() => void load(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm font-medium text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-nav-hover))]"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Yenile
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load(true)
              }}
              placeholder="E-posta ara…"
              className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-2.5 pl-9 pr-4 text-sm text-[rgb(var(--color-text))] placeholder-[rgb(var(--color-muted))] focus:border-[rgb(var(--color-brand))] focus:outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none"
          >
            <option value="active">Aktif</option>
            <option value="unsubscribed">İptal</option>
            <option value="all">Tümü</option>
          </select>
          <button
            type="button"
            onClick={() => void load(true)}
            className="rounded-xl bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Filtrele
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[rgb(var(--color-surface))] text-xs uppercase tracking-wide text-[rgb(var(--color-muted))]">
              <tr>
                <th className="px-4 py-3 font-semibold">E-posta</th>
                <th className="px-4 py-3 font-semibold">Kaynak</th>
                <th className="px-4 py-3 font-semibold">Durum</th>
                <th className="px-4 py-3 font-semibold">Kayıt</th>
                <th className="px-4 py-3 font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[rgb(var(--color-muted))]">
                    Yükleniyor…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[rgb(var(--color-muted))]">
                    Henüz abone yok.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-[rgb(var(--color-border))] text-[rgb(var(--color-text))]"
                  >
                    <td className="px-4 py-3 font-medium">{row.email}</td>
                    <td className="px-4 py-3 text-[rgb(var(--color-muted))]">
                      {SOURCE_LABELS[row.source] ?? (row.source || '—')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                          row.status === 'active'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-[rgb(var(--color-nav-hover))] text-[rgb(var(--color-muted))]'
                        )}
                      >
                        {row.status === 'active' ? 'Aktif' : 'İptal'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[rgb(var(--color-muted))]">
                      {row.subscribedAt
                        ? formatDistanceToNow(new Date(row.subscribedAt), {
                            addSuffix: true,
                            locale: tr,
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === 'active' ? (
                        <button
                          type="button"
                          disabled={actionId === row.id}
                          onClick={() => void handleAction(row, 'unsubscribe')}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          İptal et
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={actionId === row.id}
                          onClick={() => void handleAction(row, 'reactivate')}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline disabled:opacity-50"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Aktifleştir
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {nextCursor ? (
          <button
            type="button"
            onClick={() => void load(false, nextCursor)}
            disabled={loading}
            className="rounded-xl border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-medium text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-nav-hover))] disabled:opacity-50"
          >
            Daha fazla
          </button>
        ) : null}

        <p className="text-xs text-[rgb(var(--color-muted))]">
          Aboneler Firestore <code>newsletterSubscribers</code> koleksiyonunda tutulur. CSV ile
          dışa aktarıp Gmail veya başka bir bülten aracına aktarabilirsiniz. Ziyaretçiler{' '}
          <a href="/bulten/cikis" className="underline">
            /bulten/cikis
          </a>{' '}
          üzerinden kendileri çıkabilir.
        </p>
      </div>
    </div>
  )
}
