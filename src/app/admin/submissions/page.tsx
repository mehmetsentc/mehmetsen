'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  CheckCircle2, XCircle, Loader2, Inbox,
  User, MapPin, Clock, RefreshCw, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  collection, query, where, orderBy, getDocs, doc,
  updateDoc, addDoc, deleteDoc, serverTimestamp, limit, startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { DEFAULT_CATEGORIES } from '@/constants/config'

// ── Tipler ───────────────────────────────────────────────────────────────────
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

const PAGE_SIZE = 20

const FILTER_TABS: { id: FilterStatus; label: string }[] = [
  { id: 'pending_review', label: 'Bekleyenler' },
  { id: 'approved',       label: 'Onaylananlar' },
  { id: 'rejected',       label: 'Reddedilenler' },
]

function toMillis(v: unknown): number {
  if (!v) return 0
  if (typeof v === 'object' && v !== null && 'toMillis' in v) return (v as { toMillis(): number }).toMillis()
  if (typeof v === 'number') return v
  return 0
}

// ── Kart ──────────────────────────────────────────────────────────────────────
function SubmissionCard({
  item,
  onApprove,
  onReject,
  loading,
}: {
  item: UGCSubmission
  onApprove: (id: string) => void
  onReject:  (id: string) => void
  loading: string | null
}) {
  const isPending  = item.draftStatus === 'pending_review'
  const isApproved = item.draftStatus === 'approved'
  const isBusy     = loading === item.id

  const catLabel = DEFAULT_CATEGORIES.find(c => c.id === item.categoryId)?.name ?? item.categoryId ?? '—'

  return (
    <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
      {/* Medya */}
      {item.coverImageUrl && (
        <div className="relative h-48 w-full bg-[rgb(var(--color-border))]">
          <Image
            src={item.coverImageUrl}
            alt={item.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Başlık + durum */}
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h3 className="font-bold text-[rgb(var(--color-text))] leading-snug line-clamp-2">
              {item.title}
            </h3>
            <p className="mt-1 text-xs text-[rgb(var(--color-muted))] line-clamp-3">
              {item.description}
            </p>
          </div>
          {!isPending && (
            <span className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              isApproved
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            )}>
              {isApproved ? 'Onaylandı' : 'Reddedildi'}
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[rgb(var(--color-muted))]">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {item.authorDisplayName || item.authorUsername}
          </span>
          {item.city && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {item.city}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: tr })}
          </span>
          <span className="rounded-full bg-[rgb(var(--color-border))] px-2 py-0.5">
            {catLabel}
          </span>
        </div>

        {/* Video linki varsa */}
        {item.videoUrl && (
          <a
            href={item.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-500 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Video görüntüle
          </a>
        )}

        {/* Butonlar — sadece bekleyenlerde */}
        {isPending && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onApprove(item.id)}
              disabled={isBusy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Onayla
            </button>
            <button
              onClick={() => onReject(item.id)}
              disabled={isBusy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Reddet
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sayfa ─────────────────────────────────────────────────────────────────────
export default function SubmissionsPage() {
  useCmsAuth()

  const [activeFilter, setActiveFilter] = useState<FilterStatus>('pending_review')
  const [items, setItems]   = useState<UGCSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)

  const fetchItems = useCallback(async (status: FilterStatus, after?: QueryDocumentSnapshot) => {
    setLoading(true)
    try {
      const constraints = [
        where('source', '==', 'ugc'),
        where('draftStatus', '==', status),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE),
        ...(after ? [startAfter(after)] : []),
      ]
      const snap = await getDocs(query(collection(db, Collections.NEWS_DRAFTS), ...constraints))
      const fetched: UGCSubmission[] = snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          title:             data.title ?? '',
          description:       data.description ?? data.summary ?? '',
          summary:           data.summary ?? '',
          city:              data.city ?? null,
          coverImageUrl:     data.coverImageUrl ?? data.thumbnail ?? null,
          videoUrl:          data.videoUrl ?? null,
          authorId:          data.authorId ?? '',
          author:            data.author ?? '',
          authorUsername:    data.authorUsername ?? '',
          authorDisplayName: data.authorDisplayName ?? data.author ?? '',
          draftStatus:       data.draftStatus ?? status,
          categoryId:        data.categoryId ?? 'gundem',
          createdAt:         toMillis(data.createdAt),
        }
      })
      if (after) {
        setItems(prev => [...prev, ...fetched])
      } else {
        setItems(fetched)
      }
      const lastSnap = snap.docs[snap.docs.length - 1] ?? null
      setLastDoc(lastSnap)
      setHasMore(snap.docs.length === PAGE_SIZE)
    } catch (err) {
      console.error('[submissions] fetch error', err)
      toast.error('Gönderiler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLastDoc(null)
    fetchItems(activeFilter)
  }, [activeFilter, fetchItems])

  // ── Onayla: newsDrafts → news (published) ─────────────────────────────────
  const handleApprove = async (id: string) => {
    setActionLoading(id)
    try {
      const item = items.find(i => i.id === id)
      if (!item) return

      // news koleksiyonuna ekle
      const slug = item.title
        .toLowerCase()
        .replace(/[^a-z0-9ğüşıöçğüşöç\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80)
        + '-' + Date.now()

      await addDoc(collection(db, Collections.NEWS), {
        title:             item.title,
        description:       item.description,
        summary:           item.summary ?? item.description.slice(0, 280),
        slug,
        status:            'published',
        categoryId:        item.categoryId ?? 'gundem',
        coverImageUrl:     item.coverImageUrl ?? null,
        videoUrl:          item.videoUrl ?? null,
        thumbnail:         item.coverImageUrl ?? null,
        authorId:          item.authorId,
        author:            item.author,
        authorUsername:    item.authorUsername,
        authorDisplayName: item.authorDisplayName,
        source:            'ugc',
        type:              'ugc',
        city:              item.city ?? null,
        publishedAt:       serverTimestamp(),
        createdAt:         serverTimestamp(),
        updatedAt:         serverTimestamp(),
        aiGenerated:       false,
      })

      // newsDrafts durumunu güncelle
      await updateDoc(doc(db, Collections.NEWS_DRAFTS, id), {
        draftStatus: 'approved',
        updatedAt:   serverTimestamp(),
      })

      toast.success('Haber onaylandı ve yayınlandı ✓')
      setItems(prev => prev.filter(i => i.id !== id))
    } catch (err) {
      console.error('[submissions] approve error', err)
      toast.error('Onaylama başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Reddet ────────────────────────────────────────────────────────────────
  const handleReject = async (id: string) => {
    setActionLoading(id)
    try {
      await updateDoc(doc(db, Collections.NEWS_DRAFTS, id), {
        draftStatus: 'rejected',
        updatedAt:   serverTimestamp(),
      })
      toast.success('Haber reddedildi')
      setItems(prev => prev.filter(i => i.id !== id))
    } catch (err) {
      console.error('[submissions] reject error', err)
      toast.error('Reddetme başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[rgb(var(--color-surface))]">
      <CMSHeader title="Okuyucu Haberleri" />

      <div className="flex-1 px-6 py-6 max-w-5xl mx-auto w-full">
        {/* Filtre sekmeleri */}
        <div className="mb-6 flex items-center gap-2">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.id}
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
            onClick={() => fetchItems(activeFilter)}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </button>
        </div>

        {/* Liste */}
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-muted))]" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Inbox className="h-12 w-12 text-[rgb(var(--color-muted))]" />
            <p className="font-semibold text-[rgb(var(--color-text))]">
              {activeFilter === 'pending_review' ? 'Bekleyen haber yok' : 'Kayıt bulunamadı'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(item => (
              <SubmissionCard
                key={item.id}
                item={item}
                onApprove={handleApprove}
                onReject={handleReject}
                loading={actionLoading}
              />
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => fetchItems(activeFilter, lastDoc ?? undefined)}
              className="rounded-full border border-[rgb(var(--color-border))] px-6 py-2 text-sm font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] transition-colors"
            >
              Daha Fazla Yükle
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
