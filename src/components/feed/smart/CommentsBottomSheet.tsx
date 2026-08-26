'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { isSocialGraphEnabledClient } from '@/lib/social/featureFlagClient'
import { socialApi } from '@/lib/social/clientApi'

interface CommentRow {
  id: string
  content: string
  userDisplayName?: string
  createdAt: string
}

interface CommentsBottomSheetProps {
  articleId: string
  open: boolean
  onClose: () => void
}

export function CommentsBottomSheet({ articleId, open, onClose }: CommentsBottomSheetProps) {
  const { user } = useAuth()
  const socialEnabled = isSocialGraphEnabledClient()
  const [items, setItems] = useState<CommentRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(
    async (nextCursor?: string | null) => {
      if (!socialEnabled || !articleId) return
      setLoading(true)
      try {
        const q = nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ''
        const res = await fetch(`/api/social/comments?articleId=${encodeURIComponent(articleId)}${q}`)
        const body = (await res.json()) as {
          items?: CommentRow[]
          nextCursor?: string | null
        }
        setItems((prev) => (nextCursor ? [...prev, ...(body.items ?? [])] : body.items ?? []))
        setCursor(body.nextCursor ?? null)
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    },
    [articleId, socialEnabled]
  )

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const submit = async () => {
    if (!draft.trim() || !user) return
    setSubmitting(true)
    try {
      await socialApi.createComment(articleId, draft.trim())
      setDraft('')
      await load()
    } catch {
      /* auth intent handled by socialApi */
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-label="Yorumlar">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Kapat" />
      <div className="relative z-10 flex max-h-[70dvh] w-full max-w-lg flex-col rounded-t-2xl bg-[rgb(var(--color-bg))] shadow-xl">
        <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-4 py-3">
          <h3 className="font-semibold">Yorumlar</h3>
          <button type="button" onClick={onClose} aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!socialEnabled ? (
            <p className="text-sm text-[rgb(var(--color-muted))]">Yorumlar şu an kapalı.</p>
          ) : items.length === 0 && !loading ? (
            <p className="text-sm text-[rgb(var(--color-muted))]">Henüz yorum yok.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-semibold">{c.userDisplayName ?? 'Kullanıcı'}</span>
                  <p className="mt-0.5 text-[rgb(var(--color-text))]">{c.content}</p>
                </li>
              ))}
            </ul>
          )}
          {loading ? <Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin" /> : null}
          {cursor ? (
            <button
              type="button"
              className="mt-3 w-full text-center text-sm text-brand-600"
              onClick={() => void load(cursor)}
            >
              Daha fazla yükle
            </button>
          ) : null}
        </div>
        {socialEnabled ? (
          <div className="border-t border-[rgb(var(--color-border))] p-3">
            {user ? (
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Yorum yaz..."
                  className="flex-1 rounded-full border border-[rgb(var(--color-border))] bg-transparent px-4 py-2 text-sm"
                  maxLength={500}
                />
                <button
                  type="button"
                  disabled={submitting || !draft.trim()}
                  onClick={() => void submit()}
                  className={cn(
                    'rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
                  )}
                >
                  Gönder
                </button>
              </div>
            ) : (
              <p className="text-center text-sm text-[rgb(var(--color-muted))]">Yorum yapmak için giriş yapın.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
