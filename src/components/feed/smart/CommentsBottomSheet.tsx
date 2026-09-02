'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2, X, MessageSquareOff, MessageCircle, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { auth, ensureAuthReady } from '@/lib/firebase/auth'
import { socialApi } from '@/lib/social/clientApi'
import { buildAuthIntent, loginHrefWithIntent } from '@/lib/social/authIntent'

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return ''
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Az önce'
    if (diffMins < 60) return `${diffMins}dk önce`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}s önce`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}g önce`
  } catch {
    return ''
  }
}

function socialErrorMessage(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : ''
  if (msg === 'ARTICLE_NOT_FOUND') return 'Bu haber için yorum şu an kaydedilemiyor.'
  if (msg === 'AUTH_REQUIRED' || msg === 'Unauthorized') return 'Yorum için giriş yapmalısınız.'
  if (msg === 'Social graph disabled') return 'Yorumlar şu an kapalı.'
  if (msg === 'COMMENT_EMPTY') return 'Yorum boş olamaz.'
  return fallback
}

export interface CommentRow {
  id: string
  content: string
  userDisplayName?: string
  author?: {
    username?: string
    displayName?: string
    avatarUrl?: string | null
  }
  createdAt: string
}

interface CommentsBottomSheetProps {
  articleId: string
  open: boolean
  onClose: () => void
  initialCount?: number
  onCommentAdded?: () => void
}

/**
 * Mobile comments sheet — must sit ABOVE MobileNav (z-[105]) and keep composer
 * + send visible within the visual viewport (including iOS keyboard).
 */
export function CommentsBottomSheet({
  articleId,
  open,
  onClose,
  initialCount = 0,
  onCommentAdded,
}: CommentsBottomSheetProps) {
  const router = useRouter()
  const { user } = useAuth()
  const titleId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<CommentRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)

  // Lock background feed scroll + hide floating MobileNav so composer/send are tappable
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.classList.add('smart-feed-comments-open')
    document.body.classList.add('smart-feed-comments-open')
    return () => {
      document.body.style.overflow = prevOverflow
      document.documentElement.classList.remove('smart-feed-comments-open')
      document.body.classList.remove('smart-feed-comments-open')
    }
  }, [open])

  // Track visualViewport so keyboard does not bury composer/send on iPhone
  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    const vv = window.visualViewport
    const sync = () => {
      const h = vv?.height ?? window.innerHeight
      setViewportHeight(Math.round(h))
    }
    sync()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [open])

  const load = useCallback(
    async (nextCursor?: string | null) => {
      if (!articleId) return
      setLoading(true)
      try {
        const q = nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ''
        const headers: Record<string, string> = {}
        await ensureAuthReady()
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken()
          headers.Authorization = `Bearer ${token}`
        }
        const res = await fetch(`/api/social/comments?articleId=${encodeURIComponent(articleId)}${q}`, {
          headers,
          credentials: 'include',
        })
        if (res.status === 404) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string }
          if (errBody?.error === 'Social graph disabled') {
            setDisabled(true)
            return
          }
        }
        if (!res.ok) {
          throw new Error('comments_fetch_failed')
        }
        const body = (await res.json()) as {
          items?: CommentRow[]
          nextCursor?: string | null
        }
        setDisabled(false)
        setItems((prev) => (nextCursor ? [...prev, ...(body.items ?? [])] : body.items ?? []))
        setCursor(body.nextCursor ?? null)
      } catch {
        toast.error('Yorumlar yüklenemedi')
      } finally {
        setLoading(false)
      }
    },
    [articleId]
  )

  useEffect(() => {
    if (open) {
      setItems([])
      setCursor(null)
      setDraft('')
      setDisabled(false)
      void load()
    }
  }, [open, load])

  const handleLoginRedirect = () => {
    if (typeof window === 'undefined') return
    const currentUrl = window.location.pathname + window.location.search
    const intent = buildAuthIntent('COMMENT', 'article', articleId, currentUrl)
    if (intent) {
      router.push(loginHrefWithIntent(intent))
    } else {
      router.push(`/login?next=${encodeURIComponent(currentUrl)}`)
    }
  }

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const content = draft.trim()
    if (!content || submitting) return
    if (!user) {
      handleLoginRedirect()
      return
    }

    setSubmitting(true)
    try {
      await ensureAuthReady()
      if (!auth.currentUser) {
        handleLoginRedirect()
        return
      }
      await socialApi.createComment(articleId, content)
      setDraft('')
      toast.success('Yorumunuz paylaşıldı')
      onCommentAdded?.()
      await load()
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      })
    } catch (err) {
      // Keep typed text for retry
      toast.error(socialErrorMessage(err, 'Yorum gönderilemedi'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const displayCount = Math.max(initialCount, items.length)
  const canSend = Boolean(draft.trim()) && !submitting
  const sheetMaxHeight =
    viewportHeight != null
      ? Math.min(viewportHeight * 0.92, viewportHeight - 8)
      : undefined

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="smart-feed-comments-sheet"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        onClick={onClose}
        aria-label="Kapat"
        data-testid="smart-feed-comments-backdrop"
      />

      <div
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] shadow-2xl"
        style={{
          height: sheetMaxHeight ? `${Math.round(sheetMaxHeight * 0.88)}px` : 'min(75dvh, 85dvh)',
          maxHeight: sheetMaxHeight ? `${sheetMaxHeight}px` : '85dvh',
        }}
        data-testid="smart-feed-comments-panel"
      >
        <div className="flex shrink-0 justify-center bg-[rgb(var(--color-bg))] pb-1 pt-2">
          <div className="h-1.5 w-12 rounded-full bg-[rgb(var(--color-border))] opacity-70" aria-hidden />
        </div>

        <div className="flex shrink-0 items-center justify-between border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-5 py-3">
          <div className="flex items-center gap-2">
            <h3 id={titleId} className="text-base font-bold text-[rgb(var(--color-text))]">
              Yorumlar
            </h3>
            {displayCount > 0 ? (
              <span className="text-xs font-semibold text-[rgb(var(--color-muted))]">
                ({displayCount})
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-full p-1.5 text-[rgb(var(--color-muted))] transition-colors hover:bg-black/5 hover:text-[rgb(var(--color-text))] dark:hover:bg-white/5"
            data-testid="smart-feed-comments-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Only this region scrolls — composer stays flex-none */}
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
          data-testid="smart-feed-comments-list"
        >
          {disabled ? (
            <div className="flex min-h-full flex-col items-center justify-center py-10 text-center text-[rgb(var(--color-muted))]">
              <MessageSquareOff className="mb-2 h-9 w-9 stroke-[1.5] opacity-50" />
              <p className="text-sm font-medium">Yorumlar şu an kapalı.</p>
            </div>
          ) : items.length === 0 && !loading ? (
            <div className="flex min-h-full flex-col items-center justify-center py-10 text-center text-[rgb(var(--color-muted))]">
              <MessageCircle className="mb-2 h-9 w-9 stroke-[1.5] opacity-50" />
              <p className="text-sm font-medium">Henüz yorum yok.</p>
              <p className="mt-1 text-xs">İlk yorumu sen yaz!</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((c) => {
                const authorName = c.author?.displayName || c.userDisplayName || 'Kullanıcı'
                const authorAvatar = c.author?.avatarUrl
                return (
                  <li key={c.id} className="flex items-start gap-3 text-sm">
                    {authorAvatar ? (
                      <Image
                        src={authorAvatar}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600/15 text-xs font-bold text-brand-600">
                        {authorName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[rgb(var(--color-text))]">
                          {authorName}
                        </span>
                        {c.createdAt ? (
                          <span className="text-[11px] text-[rgb(var(--color-muted))]">
                            {formatRelativeTime(c.createdAt)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[rgb(var(--color-text))]">
                        {c.content}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : null}

          {cursor && !loading ? (
            <button
              type="button"
              className="mt-3 w-full py-2 text-center text-xs font-semibold text-brand-600 transition hover:text-brand-700"
              onClick={() => void load(cursor)}
            >
              Daha fazla yorum yükle
            </button>
          ) : null}
        </div>

        {!disabled ? (
          <div
            className="shrink-0 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-4 pt-3"
            style={{
              paddingBottom:
                'max(0.75rem, env(safe-area-inset-bottom, 0px))',
            }}
            data-testid="smart-feed-comments-composer"
          >
            {user ? (
              <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Yorum ekle..."
                  className="min-w-0 flex-1 rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] transition focus:border-brand-600 focus:outline-none"
                  maxLength={500}
                  disabled={submitting}
                  enterKeyHint="send"
                  data-testid="smart-feed-comments-input"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label="Yorumu gönder"
                  data-testid="smart-feed-comments-send"
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition',
                    canSend
                      ? 'bg-brand-600 hover:bg-brand-700 active:scale-95'
                      : 'cursor-not-allowed bg-brand-600/35'
                  )}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between gap-3 px-1 py-0.5">
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  Yorum yapmak için giriş yapmalısınız.
                </p>
                <button
                  type="button"
                  onClick={handleLoginRedirect}
                  className="shrink-0 rounded-full bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
                >
                  Giriş Yap
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
