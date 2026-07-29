'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { MoreHorizontal, Newspaper, Search } from 'lucide-react'
import { adminNewsService, type AdminNewsFilter, type AdminNewsItem } from '@/services/adminNewsService'
import { getCategoryLabel } from '@/lib/newsMapper'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { QueryDocumentSnapshot } from 'firebase/firestore'

const CHIPS: { id: AdminNewsFilter; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'published', label: 'Yayında' },
  { id: 'pending', label: 'Onay' },
  { id: 'draft', label: 'Taslak' },
]

const STATUS: Record<string, { label: string; cls: string }> = {
  published: { label: 'YAYINDA', cls: 'text-emerald-600' },
  pending: { label: 'ONAY', cls: 'text-amber-600' },
  draft: { label: 'TASLAK', cls: 'text-blue-600' },
  archived: { label: 'ARŞİV', cls: 'text-[rgb(var(--color-muted))]' },
  removed: { label: 'KALDIRILDI', cls: 'text-red-600' },
}

export function MobileContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const filterParam = (searchParams.get('filter') as AdminNewsFilter | null) ?? 'all'
  const filter: AdminNewsFilter = CHIPS.some((c) => c.id === filterParam) ? filterParam : 'all'

  const [posts, setPosts] = useState<AdminNewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [q, setQ] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const cursorRef = useRef<QueryDocumentSnapshot | null>(null)

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) {
        setLoading(true)
        cursorRef.current = null
      } else {
        setLoadingMore(true)
      }
      try {
        const result = await adminNewsService.list(
          filter,
          reset ? undefined : cursorRef.current ?? undefined,
          undefined,
          25
        )
        cursorRef.current = result.lastDoc
        setHasMore(result.hasMore)
        setPosts((prev) => (reset ? result.posts : [...prev, ...result.posts]))
      } catch {
        if (reset) setPosts([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [filter]
  )

  useEffect(() => {
    void load(true)
  }, [load])

  const filtered = posts.filter((p) => {
    const term = q.trim().toLowerCase()
    if (!term) return true
    return [p.title, p.spot, p.summary, p.categoryId, p.authorDisplayName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(term)
  })

  function setFilter(id: AdminNewsFilter) {
    const params = new URLSearchParams(searchParams.toString())
    if (id === 'all') params.delete('filter')
    else params.set('filter', id)
    router.replace(`/admin/news${params.toString() ? `?${params}` : ''}`)
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-3">
        <h1 className="text-xl font-bold tracking-tight text-[rgb(var(--color-text))]">İçerik</h1>
        <p className="text-sm text-[rgb(var(--color-muted))]">Haber odası arşivi</p>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Başlık, kategori, yazar…"
          className="h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] pl-10 pr-3 text-[15px] text-[rgb(var(--color-text))] outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/30"
          enterKeyHint="search"
        />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            className={cn(
              'shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold',
              filter === c.id
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-[rgb(var(--color-border))]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-[rgb(var(--color-border))] px-4 py-14 text-center">
          <Newspaper className="mx-auto h-8 w-8 text-[rgb(var(--color-muted))]" />
          <p className="mt-2 text-sm font-semibold text-[rgb(var(--color-text))]">Haber bulunamadı.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          {filtered.map((post) => {
            const badge = STATUS[post.status ?? 'draft'] ?? STATUS.draft
            const when = post.publishedAt ?? post.createdAt
            return (
              <div key={post.id} className="relative border-b border-[rgb(var(--color-border))] last:border-b-0">
                <Link
                  href={
                    post.status === 'pending'
                      ? `/admin/approvals/${post.id}?source=${post.adminSource === 'newsDrafts' ? 'newsDrafts' : 'news'}`
                      : `/admin/news/${post.id}/edit`
                  }
                  className="flex gap-3 px-3 py-3 active:bg-[rgb(var(--color-surface))]"
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[rgb(var(--color-surface))]">
                    {post.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 pr-8">
                    <span className={cn('text-[10px] font-bold uppercase tracking-wide', badge.cls)}>
                      {badge.label}
                      {post.isBreaking ? ' · SON DAKİKA' : ''}
                    </span>
                    <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-[rgb(var(--color-text))]">
                      {post.title}
                    </p>
                    <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">
                      {getCategoryLabel(post.categoryId)}
                      {when
                        ? ` · ${formatDistanceToNow(new Date(when), { locale: tr, addSuffix: true })}`
                        : ''}
                      {post.authorDisplayName ? ` · ${post.authorDisplayName}` : ''}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  className="absolute right-1 top-2 flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--color-muted))]"
                  aria-label="İşlemler"
                  onClick={() => setMenuId((id) => (id === post.id ? null : post.id))}
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {menuId === post.id ? (
                  <div className="absolute right-3 top-12 z-10 min-w-[160px] overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-xl">
                    <Link
                      href={`/admin/news/${post.id}/edit`}
                      className="block px-4 py-3 text-sm font-semibold text-[rgb(var(--color-text))]"
                      onClick={() => setMenuId(null)}
                    >
                      Düzenle
                    </Link>
                    {post.status === 'published' && post.slug ? (
                      <a
                        href={`/haber/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-4 py-3 text-sm font-semibold text-[rgb(var(--color-text))]"
                        onClick={() => setMenuId(null)}
                      >
                        Önizle
                      </a>
                    ) : null}
                    {post.status === 'pending' ? (
                      <Link
                        href={`/admin/approvals/${post.id}?source=${post.adminSource === 'newsDrafts' ? 'newsDrafts' : 'news'}`}
                        className="block px-4 py-3 text-sm font-semibold text-[rgb(var(--color-brand))]"
                        onClick={() => setMenuId(null)}
                      >
                        İncele / Onayla
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {hasMore && !q.trim() ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void load(false)}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-xl border border-[rgb(var(--color-border))] text-sm font-semibold text-[rgb(var(--color-text))]"
        >
          {loadingMore ? 'Yükleniyor…' : 'Daha fazla'}
        </button>
      ) : null}
    </div>
  )
}
