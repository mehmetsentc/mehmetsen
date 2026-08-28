'use client'

import { useState } from 'react'
import { MoreHorizontal, EyeOff, MinusCircle, Tag } from 'lucide-react'
import { auth, ensureAuthReady } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import type { FeedItemDto } from '@/types/smartFeed'

type FeedbackType = 'hide_article' | 'less_publisher' | 'less_topic'

interface FeedCardMenuProps {
  item: FeedItemDto
  className?: string
  onFeedback?: (type: FeedbackType) => void
}

async function submitFeedback(payload: {
  type: FeedbackType
  articleId?: string
  publisherId?: string
  category?: string
}) {
  await ensureAuthReady()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const user = auth.currentUser
  if (user) {
    headers.Authorization = `Bearer ${await user.getIdToken()}`
  }
  const res = await fetch('/api/feed/feedback', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('feedback_failed')
}

export function FeedCardMenu({ item, className, onFeedback }: FeedCardMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const run = async (type: FeedbackType, label: string) => {
    setBusy(true)
    try {
      await submitFeedback({
        type,
        articleId: type === 'hide_article' ? item.articleId : undefined,
        publisherId: type === 'less_publisher' ? item.publisher?.id : undefined,
        category: type === 'less_topic' ? item.category ?? undefined : undefined,
      })
      setDone(label)
      onFeedback?.(type)
      setOpen(false)
    } catch {
      setDone('Hata oluştu')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        aria-label="Feed seçenekleri"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/55"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>

      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-40" aria-label="Menüyü kapat" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 min-w-[220px] overflow-hidden rounded-xl border border-white/10 bg-gray-950/95 py-1 shadow-xl backdrop-blur-md">
            <button
              type="button"
              disabled={busy}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white hover:bg-white/10"
              onClick={() => run('hide_article', 'Gizlendi')}
            >
              <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
              Bu haberi gizle
            </button>
            {item.publisher ? (
              <button
                type="button"
                disabled={busy}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white hover:bg-white/10"
                onClick={() => run('less_publisher', 'Kaynak azaltıldı')}
              >
                <MinusCircle className="h-4 w-4 shrink-0" aria-hidden />
                Bu kaynaktan daha az göster
              </button>
            ) : null}
            {item.category ? (
              <button
                type="button"
                disabled={busy}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white hover:bg-white/10"
                onClick={() => run('less_topic', 'Konu azaltıldı')}
              >
                <Tag className="h-4 w-4 shrink-0" aria-hidden />
                Bu konudan daha az göster
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {done ? (
        <span className="absolute right-0 top-11 z-50 whitespace-nowrap rounded-lg bg-black/70 px-2 py-1 text-xs text-white">
          {done}
        </span>
      ) : null}
    </div>
  )
}
