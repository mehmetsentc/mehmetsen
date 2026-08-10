'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Check,
  MoreHorizontal,
  Newspaper,
  Search,
  Share2,
  Smartphone,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { adminNewsService, type AdminNewsFilter, type AdminNewsItem } from '@/services/adminNewsService'
import { getMobileCategoryLabel, updateNewsCategory } from '@/lib/mobileAdminCategory'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { MobileCategorySheet } from './MobileCategorySheet'
import { MobileSocialShareSheet, type SocialShareMode } from './MobileSocialShareSheet'

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

const REJECT_REASONS = ['Kaynak yetersiz', 'Tekrar haber', 'İçerik hatalı', 'Görsel uygun değil', 'Diğer']

function newsHasShareImage(post: AdminNewsItem): boolean {
  if (post.coverImageUrl?.trim()) return true
  return (post.mediaItems ?? []).some((m) => m.type === 'image' && !!m.url?.trim())
}

export function MobileContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { can } = useCmsAuth()
  const filterParam = (searchParams.get('filter') as AdminNewsFilter | null) ?? 'all'
  const filter: AdminNewsFilter = CHIPS.some((c) => c.id === filterParam) ? filterParam : 'all'

  const [posts, setPosts] = useState<AdminNewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [q, setQ] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [categoryPost, setCategoryPost] = useState<AdminNewsItem | null>(null)
  const [categorySaving, setCategorySaving] = useState(false)
  const [shareTarget, setShareTarget] = useState<{ post: AdminNewsItem; mode: SocialShareMode } | null>(null)
  const [rejectPost, setRejectPost] = useState<AdminNewsItem | null>(null)
  const [toast, setToast] = useState<string | null>(null)
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

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2000)
  }

  async function handleCategorySelect(categoryId: string) {
    if (!categoryPost) return
    const postId = categoryPost.id
    const prev = categoryPost
    setCategorySaving(true)
    setPosts((items) =>
      items.map((p) =>
        p.id === postId ? { ...p, categoryId, isBreaking: categoryId === 'son-dakika' } : p
      )
    )
    try {
      await updateNewsCategory(postId, categoryId)
      flash('Kategori güncellendi')
      setCategoryPost(null)
    } catch (e) {
      setPosts((items) => items.map((p) => (p.id === postId ? prev : p)))
      flash(e instanceof Error ? e.message : 'Kategori güncellenemedi')
    } finally {
      setCategorySaving(false)
    }
  }

  async function handleApprove(post: AdminNewsItem) {
    if (!can('news:publish') && !can('news:edit')) {
      flash('Onay yetkiniz yok')
      return
    }
    setActionId(post.id)
    try {
      await adminNewsService.approve(post.id, post.adminSource)
      setPosts((items) => items.filter((p) => p.id !== post.id))
      flash('Haber onaylandı')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Onay başarısız')
    } finally {
      setActionId(null)
    }
  }

  async function handleReject(post: AdminNewsItem, reason?: string) {
    setActionId(post.id)
    setRejectPost(null)
    try {
      await adminNewsService.reject(post.id, post.adminSource, reason)
      setPosts((items) => items.filter((p) => p.id !== post.id))
      flash('Haber reddedildi')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Red başarısız')
    } finally {
      setActionId(null)
    }
  }

  async function handleRemove(post: AdminNewsItem) {
    setMenuId(null)
    if (!window.confirm('Bu haberi kaldırmak istediğinize emin misiniz?')) return
    setActionId(post.id)
    try {
      if (post.adminSource === 'newsQueue') {
        await adminNewsService.remove(post.id, undefined, 'newsQueue')
      } else if (post.status === 'draft' || post.status === 'archived') {
        await adminNewsService.permanentDelete(post.id)
      } else {
        await adminNewsService.remove(post.id)
      }
      setPosts((items) => items.filter((p) => p.id !== post.id))
      flash('Haber kaldırıldı')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Silme başarısız')
    } finally {
      setActionId(null)
    }
  }

  function handleShareDone(mode: SocialShareMode) {
    if (!shareTarget) return
    const { post, mode: shareMode } = shareTarget
    setPosts((items) =>
      items.map((p) =>
        p.id === post.id
          ? {
              ...p,
              storyPublished: shareMode === 'story' ? true : p.storyPublished,
              socialPublished: shareMode === 'post' ? true : p.socialPublished,
            }
          : p
      )
    )
    flash(mode === 'story' ? 'Hikâye paylaşıldı' : 'Post paylaşıldı')
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
            const busy = actionId === post.id
            const canShare = newsHasShareImage(post)
            const isPending = post.status === 'pending'
            const isPublished = post.status === 'published'

            return (
              <div key={post.id} className="relative border-b border-[rgb(var(--color-border))] last:border-b-0">
                <Link
                  href={
                    isPending
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
                      {getMobileCategoryLabel(post.categoryId ?? '')}
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

                <div className="flex flex-wrap gap-1.5 border-t border-[rgb(var(--color-border))]/60 px-2 py-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setCategoryPost(post)}
                    className="flex min-h-11 items-center gap-1 rounded-xl border border-[rgb(var(--color-border))] px-3 text-[11px] font-bold text-[rgb(var(--color-text))] disabled:opacity-50"
                  >
                    <Tag className="h-3.5 w-3.5" />
                    Kategori
                  </button>

                  {isPending ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleApprove(post)}
                        className="flex min-h-11 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Onayla
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRejectPost(post)}
                        className="flex min-h-11 items-center gap-1 rounded-xl bg-red-600 px-3 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reddet
                      </button>
                    </>
                  ) : null}

                  {isPublished ? (
                    <>
                      <button
                        type="button"
                        disabled={!canShare || busy}
                        onClick={() => setShareTarget({ post, mode: 'story' })}
                        className={cn(
                          'flex min-h-11 items-center gap-1 rounded-xl border px-3 text-[11px] font-bold disabled:opacity-40',
                          post.storyPublished
                            ? 'border-violet-300 text-violet-700'
                            : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-text))]'
                        )}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        Hikâye
                      </button>
                      <button
                        type="button"
                        disabled={!canShare || busy}
                        onClick={() => setShareTarget({ post, mode: 'post' })}
                        className={cn(
                          'flex min-h-11 items-center gap-1 rounded-xl border px-3 text-[11px] font-bold disabled:opacity-40',
                          post.socialPublished
                            ? 'border-sky-300 text-sky-700'
                            : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-text))]'
                        )}
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Post
                      </button>
                    </>
                  ) : null}
                </div>

                {menuId === post.id ? (
                  <div className="absolute right-3 top-12 z-10 min-w-[160px] overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-xl">
                    <Link
                      href={`/admin/news/${post.id}/edit`}
                      className="flex min-h-11 items-center px-4 text-sm font-semibold text-[rgb(var(--color-text))]"
                      onClick={() => setMenuId(null)}
                    >
                      Düzenle
                    </Link>
                    {isPublished && post.slug ? (
                      <a
                        href={`/haber/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center px-4 text-sm font-semibold text-[rgb(var(--color-text))]"
                        onClick={() => setMenuId(null)}
                      >
                        Önizle
                      </a>
                    ) : null}
                    {isPending ? (
                      <Link
                        href={`/admin/approvals/${post.id}?source=${post.adminSource === 'newsDrafts' ? 'newsDrafts' : 'news'}`}
                        className="flex min-h-11 items-center px-4 text-sm font-semibold text-[rgb(var(--color-brand))]"
                        onClick={() => setMenuId(null)}
                      >
                        İncele
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemove(post)}
                      className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm font-semibold text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Sil
                    </button>
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

      <MobileCategorySheet
        open={!!categoryPost}
        onClose={() => setCategoryPost(null)}
        categoryId={categoryPost?.categoryId ?? ''}
        onSelect={handleCategorySelect}
        saving={categorySaving}
      />

      {shareTarget ? (
        <MobileSocialShareSheet
          open
          mode={shareTarget.mode}
          postId={shareTarget.post.id}
          isAlreadyPublished={
            shareTarget.mode === 'story'
              ? !!shareTarget.post.storyPublished
              : !!shareTarget.post.socialPublished
          }
          onClose={() => setShareTarget(null)}
          onDone={handleShareDone}
        />
      ) : null}

      {rejectPost ? (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button type="button" className="absolute inset-0 bg-black/45" onClick={() => setRejectPost(null)} />
          <div
            className="absolute inset-x-0 bottom-0 space-y-2 rounded-t-2xl bg-[rgb(var(--color-card))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            role="dialog"
            aria-label="Reddetme nedeni"
          >
            <p className="text-sm font-bold text-[rgb(var(--color-text))]">Reddetme nedeni</p>
            {REJECT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={actionId === rejectPost.id}
                onClick={() => void handleReject(rejectPost, reason)}
                className="flex min-h-11 w-full items-center rounded-xl border border-[rgb(var(--color-border))] px-3 text-left text-sm font-medium text-[rgb(var(--color-text))]"
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-[80] flex justify-center px-4">
          <div className="rounded-full bg-[rgb(var(--color-text))] px-4 py-2 text-xs font-semibold text-[rgb(var(--color-card))] shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  )
}
