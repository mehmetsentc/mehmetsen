'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Send, Loader2, MoreHorizontal, Flag, UserX, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { commentService } from '@/services/commentService'
import { useAuth } from '@/hooks/useAuth'
import type { Comment } from '@/types/comment'
import { formatCount } from '@/lib/postUtils'
import { moderate } from '@/lib/moderationClient'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'

interface VideoCommentSheetProps {
  postId: string
  open: boolean
  onClose: () => void
  commentsCount: number
  onCommentAdded?: () => void
}

type ReportReason = 'spam' | 'harassment' | 'hate_speech' | 'misinformation' | 'violence' | 'nudity' | 'other'

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam',           label: 'Spam / reklam' },
  { value: 'harassment',     label: 'Taciz / zorbalık' },
  { value: 'hate_speech',    label: 'Nefret söylemi' },
  { value: 'misinformation', label: 'Yanlış bilgi' },
  { value: 'violence',       label: 'Şiddet içeriği' },
  { value: 'nudity',         label: 'Uygunsuz içerik' },
  { value: 'other',          label: 'Diğer' },
]

// ── Şikayet modal ─────────────────────────────────────────────────────────────
function ReportModal({
  comment,
  onClose,
  onSubmit,
}: {
  comment: Comment
  onClose: () => void
  onSubmit: (reason: ReportReason) => Promise<void>
}) {
  const [selected, setSelected] = useState<ReportReason | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    if (!selected) return
    setSubmitting(true)
    await onSubmit(selected)
    setSubmitting(false)
    setDone(true)
    setTimeout(onClose, 1500)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-[rgb(var(--color-card))] p-5 shadow-xl">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle className="h-10 w-10 text-green-500" />
            <p className="font-semibold text-[rgb(var(--color-text))]">Şikayet alındı</p>
            <p className="text-sm text-[rgb(var(--color-muted))]">24 saat içinde incelenecek.</p>
          </div>
        ) : (
          <>
            <h3 className="mb-1 font-semibold text-[rgb(var(--color-text))]">Yorumu Şikayet Et</h3>
            <p className="mb-4 text-xs text-[rgb(var(--color-muted))]">
              @{comment.authorUsername} — &ldquo;{comment.content.slice(0, 60)}{comment.content.length > 60 ? '…' : ''}&rdquo;
            </p>
            <ul className="space-y-1">
              {REPORT_REASONS.map((r) => (
                <li key={r.value}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.value)}
                    className={cn(
                      'w-full rounded-xl px-4 py-2.5 text-left text-sm transition-colors',
                      selected === r.value
                        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                        : 'text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
                    )}
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-[rgb(var(--color-border))] py-2.5 text-sm text-[rgb(var(--color-muted))]"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!selected || submitting}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Şikayet Et'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Yorum satırı ──────────────────────────────────────────────────────────────
function CommentRow({
  comment,
  currentUserId,
  hiddenIds,
  onHide,
}: {
  comment: Comment
  currentUserId: string | undefined
  hiddenIds: Set<string>
  onHide: (authorId: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState<Comment | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  if (hiddenIds.has(comment.authorId)) return null

  const handleReport = async (reason: ReportReason) => {
    try {
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: comment.id, targetType: 'comment', reason }),
        credentials: 'include',
      })
    } catch { /* ignore */ }
  }

  const handleBlock = async () => {
    setMenuOpen(false)
    try {
      await fetch('/api/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedUserId: comment.authorId }),
        credentials: 'include',
      })
      onHide(comment.authorId)
      toast.success(`@${comment.authorUsername} engellendi`)
    } catch {
      toast.error('Engelleme başarısız')
    }
  }

  return (
    <>
      <li className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-400">
          {comment.authorUsername[0]?.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold text-[rgb(var(--color-text))]">
              @{comment.authorUsername}
            </span>{' '}
            <span className="text-[rgb(var(--color-muted))]">{comment.content}</span>
          </p>
        </div>

        {/* Şikayet/Engelle menüsü — kendi yorumunda gösterme */}
        {currentUserId && currentUserId !== comment.authorId && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((p) => !p)}
              className="rounded-full p-1 text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
              aria-label="Seçenekler"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-[65] min-w-[160px] rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setReportTarget(comment) }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-orange-600 hover:bg-[rgb(var(--color-surface))]"
                >
                  <Flag className="h-4 w-4" />
                  Şikayet et
                </button>
                <button
                  type="button"
                  onClick={handleBlock}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-[rgb(var(--color-surface))]"
                >
                  <UserX className="h-4 w-4" />
                  Kullanıcıyı engelle
                </button>
              </div>
            )}
          </div>
        )}
      </li>

      {reportTarget && (
        <ReportModal
          comment={reportTarget}
          onClose={() => setReportTarget(null)}
          onSubmit={handleReport}
        />
      )}
    </>
  )
}

// ── Ana sheet ─────────────────────────────────────────────────────────────────
export function VideoCommentSheet({
  postId,
  open,
  onClose,
  commentsCount,
  onCommentAdded,
}: VideoCommentSheetProps) {
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [text, setText] = useState('')
  const [hiddenAuthorIds, setHiddenAuthorIds] = useState<Set<string>>(new Set())

  const loadComments = useCallback(async () => {
    setLoading(true)
    try {
      const data = await commentService.getByPost(postId)
      setComments(data)
    } catch {
      toast.error('Yorumlar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    if (open) loadComments()
  }, [open, loadComments])

  const handleHideAuthor = useCallback((authorId: string) => {
    setHiddenAuthorIds((prev) => new Set([...prev, authorId]))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast.error('Yorum yapmak için giriş yapın')
      return
    }
    const content = text.trim()
    if (!content) return
    if (content.length > 500) {
      toast.error('Yorum en fazla 500 karakter olabilir')
      return
    }

    setSubmitting(true)
    try {
      const idToken = await auth.currentUser?.getIdToken()
      if (!idToken) {
        toast.error('Oturum doğrulanamadı. Tekrar giriş yapın.')
        return
      }

      const moderation = await moderate({ text: content, idToken })
      if (moderation.decision !== 'approve') {
        toast.error('Yorumunuz yayın kurallarına uymuyor. Lütfen düzenleyip tekrar deneyin.')
        return
      }

      await commentService.create({
        postId,
        content,
        authorId: user.uid,
        authorUsername: user.username,
        authorPhotoURL: user.photoURL,
      })
      setText('')
      await loadComments()
      onCommentAdded?.()
      toast.success('Yorum eklendi')
    } catch (error) {
      console.error('[VideoCommentSheet] submit failed:', error)
      const message = error instanceof Error ? error.message : 'Yorum gönderilemedi'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label="Kapat"
      />

      <div className="relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-[rgb(var(--color-card))] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-4 py-3">
          <h3 className="font-semibold text-[rgb(var(--color-text))]">
            Yorumlar ({formatCount(commentsCount)})
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Topluluk kuralları notu */}
        <div className="border-b border-[rgb(var(--color-border))] bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          Saygılı ve yapıcı yorumlar yapın. Uygunsuz içerik kaldırılır ve hesap askıya alınabilir.
          Şikayet etmek için ··· menüsünü kullanın.
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--color-muted))]" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">
              Henüz yorum yok. İlk yorumu sen yap!
            </p>
          ) : (
            <ul className="space-y-4">
              {comments.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  currentUserId={user?.uid}
                  hiddenIds={hiddenAuthorIds}
                  onHide={handleHideAuthor}
                />
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-[rgb(var(--color-border))] p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Yorum ekle..."
              maxLength={500}
              className="flex-1 rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={submitting || !text.trim()}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white transition-colors',
                'hover:bg-blue-700 disabled:opacity-50'
              )}
              aria-label="Gönder"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
