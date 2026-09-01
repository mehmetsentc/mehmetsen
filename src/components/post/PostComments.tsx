'use client'

import { useState, useEffect, useCallback } from 'react'
import { Send, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { commentService } from '@/services/commentService'
import { useAuth } from '@/hooks/useAuth'
import { formatCount } from '@/lib/postUtils'
import { moderate } from '@/lib/moderationClient'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import type { Comment } from '@/types/comment'

interface PostCommentsProps {
  postId: string
  initialCount: number
}

export function PostComments({ postId, initialCount }: PostCommentsProps) {
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(true)
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
    loadComments()
  }, [loadComments])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast.error('Yorum yapmak için giriş yapın')
      return
    }
    const content = text.trim()
    if (!content) return

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
      setCount((c) => c + 1)
      await loadComments()
      toast.success('Yorum eklendi')
    } catch (error) {
      console.error('[PostComments] submit failed:', error)
      toast.error('Yorum gönderilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mt-6 border-t border-gray-100 pt-6 dark:border-gray-800" aria-label="Yorumlar">
      <div className="mb-4 text-base font-bold text-gray-900 dark:text-gray-100">
        Yorumlar ({formatCount(count)})
      </div>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={user ? 'Yorumunuzu yazın...' : 'Yorum yapmak için giriş yapın'}
            maxLength={500}
            disabled={!user}
            className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          <button
            type="submit"
            disabled={submitting || !text.trim() || !user}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-colors',
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

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Henüz yorum yok.</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                {comment.authorUsername[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    @{comment.authorUsername}
                  </span>{' '}
                  <span className="text-gray-700 dark:text-gray-300">{comment.content}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
