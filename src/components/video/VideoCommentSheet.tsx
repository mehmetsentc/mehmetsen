'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Send, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { commentService } from '@/services/commentService'
import { useAuth } from '@/hooks/useAuth'
import type { Comment } from '@/types/comment'
import { formatCount } from '@/lib/postUtils'
import { cn } from '@/lib/utils'

interface VideoCommentSheetProps {
  postId: string
  open: boolean
  onClose: () => void
  commentsCount: number
  onCommentAdded?: () => void
}

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
    } catch {
      toast.error('Yorum gönderilemedi')
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

      <div className="relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-900">
            Yorumlar ({formatCount(commentsCount)})
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              Henüz yorum yok. İlk yorumu sen yap!
            </p>
          ) : (
            <ul className="space-y-4">
              {comments.map((comment) => (
                <li key={comment.id} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                    {comment.authorUsername[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold text-gray-900">
                        @{comment.authorUsername}
                      </span>{' '}
                      <span className="text-gray-700">{comment.content}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Yorum ekle..."
              maxLength={500}
              className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
