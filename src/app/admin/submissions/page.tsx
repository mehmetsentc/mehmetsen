'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  CheckCircle2, XCircle, Loader2, Inbox,
  User, MapPin, Clock, RefreshCw, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { auth } from '@/lib/firebase/auth'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { DEFAULT_CATEGORIES } from '@/constants/config'

type FilterStatus = 'pending_review' | 'approved' | 'rejected'

interface UGCSubmission {
  id: string
  title: string
  description: string
  summary?: string
  city?: string | null
  coverImageUrl?: string | null
  videoUrl?: string | null
  authorId: string
  author: string
  authorUsername: string
  authorDisplayName: string
  draftStatus: string
  categoryId?: string
  createdAt: number
}

const FILTER_TABS: { id: FilterStatus; label: string }[] = [
  { id: 'pending_review', label: 'Bekleyenler' },
  { id: 'approved', label: 'Onaylananlar' },
  { id: 'rejected', label: 'Reddedilenler' },
]

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function categoryLabel(id?: string) {
  return DEFAULT_CATEGORIES.find((c) => c.id === id)?.name ?? id ?? 'Gündem'
}

export default function AdminSubmissionsPage() {
  const { can } = useCmsAuth()
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('pending_review')
  const [items, setItems] = useState<UGCSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchItems = useCallback(async (status: FilterStatus) => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/submissions?status=${encodeURIComponent(status)}`, {
        headers: await authHeaders(),
      })
      const body = (await res.json()) as { items?: UGCSubmission[]; error?: string }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setItems(body.items ?? [])
    } catch (err) {
      console.error('[submissions] fetch error', err)
      setItems([])
      const msg = err instanceof Error ? err.message : 'Gönderiler yüklenemedi'
      setLoadError(msg)
      toast.error(msg.includes('index') || msg.includes('INDEX')
        ? 'Firestore index eksik — fallback deneniyor / admin yenileyin'
        : 'Gönderiler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchItems(activeFilter)
  }, [activeFilter, fetchItems])

  const handleApprove = async (id: string) => {
    if (!can('news:publish') && !can('news:edit')) {
      toast.error('Yetkiniz yok')
      return
    }
    setActionLoading(id)
    try {
      const res = await fetch('/api/admin/submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, action: 'approve' }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Onaylama başarısız')
      toast.success('Haber onaylandı ve yayınlandı')
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      console.error('[submissions] approve error', err)
      toast.error(err instanceof Error ? err.message : 'Onaylama başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (id: string) => {
    if (!can('news:publish') && !can('news:edit')) {
      toast.error('Yetkiniz yok')
      return
    }
    setActionLoading(id)
    try {
      const res = await fetch('/api/admin/submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, action: 'reject' }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Reddetme başarısız')
      toast.success('Haber reddedildi')
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      console.error('[submissions] reject error', err)
      toast.error(err instanceof Error ? err.message : 'Reddetme başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[rgb(var(--color-surface))]">
      <CMSHeader title="Okuyucu Haberleri" />

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                activeFilter === tab.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void fetchItems(activeFilter)}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </button>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-muted))]" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Inbox className="h-12 w-12 text-red-500/70" />
            <p className="font-semibold text-[rgb(var(--color-text))]">Gönderiler yüklenemedi</p>
            <p className="max-w-md text-sm text-[rgb(var(--color-muted))]">{loadError}</p>
            <button
              type="button"
              onClick={() => void fetchItems(activeFilter)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Tekrar dene
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Inbox className="h-12 w-12 text-[rgb(var(--color-muted))]" />
            <p className="font-semibold text-[rgb(var(--color-text))]">
              {activeFilter === 'pending_review' ? 'Bekleyen haber yok' : 'Kayıt bulunamadı'}
            </p>
            <p className="max-w-sm text-sm text-[rgb(var(--color-muted))]">
              Okuyucuların gönderdiği haber önerileri burada listelenir.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]"
              >
                <div className="flex flex-col gap-4 p-4 sm:flex-row">
                  {item.coverImageUrl ? (
                    <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-40">
                      <Image
                        src={item.coverImageUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="160px"
                        unoptimized
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                      <span>{categoryLabel(item.categoryId)}</span>
                      {item.city ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {item.city}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="text-base font-bold text-[rgb(var(--color-text))]">{item.title}</h2>
                    <p className="mt-1 line-clamp-3 text-sm text-[rgb(var(--color-muted))]">
                      {item.description || item.summary}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[rgb(var(--color-muted))]">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {item.authorDisplayName || item.author || item.authorUsername || '—'}
                      </span>
                      {item.createdAt ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDistanceToNow(item.createdAt, { addSuffix: true, locale: tr })}
                        </span>
                      ) : null}
                      {item.videoUrl ? (
                        <a
                          href={item.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[rgb(var(--color-brand))]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Video
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
                {activeFilter === 'pending_review' ? (
                  <div className="flex gap-2 border-t border-[rgb(var(--color-border))] px-4 py-3">
                    <button
                      type="button"
                      disabled={actionLoading === item.id}
                      onClick={() => void handleApprove(item.id)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {actionLoading === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Onayla
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading === item.id}
                      onClick={() => void handleReject(item.id)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Reddet
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
