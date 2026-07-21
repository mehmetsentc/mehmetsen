'use client'

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const REACTIONS = [
  { key: 'like', emoji: '👍', label: 'Beğen' },
  { key: 'love', emoji: '❤️', label: 'Sevdim' },
  { key: 'wow', emoji: '😮', label: 'Şaşırtıcı' },
  { key: 'sad', emoji: '😢', label: 'Üzücü' },
  { key: 'fire', emoji: '🔥', label: 'Etkili' },
] as const

type ReactionKey = (typeof REACTIONS)[number]['key']

interface ArticleReactionsProps {
  postId: string
}

const STORAGE_KEY = (id: string) => `nahaber:reactions:${id}`

/**
 * Hafif emoji reaksiyon barı — framer-motion yok (INP).
 * localStorage tabanlı tercih; CSS transition yeterli.
 */
export function ArticleReactions({ postId }: ArticleReactionsProps) {
  const [selected, setSelected] = useState<ReactionKey | null>(null)
  const [counts, setCounts] = useState<Record<ReactionKey, number>>({
    like: 0,
    love: 0,
    wow: 0,
    sad: 0,
    fire: 0,
  })

  useEffect(() => {
    const seed = postId.length + postId.charCodeAt(0)
    setCounts({
      like: 12 + (seed % 60),
      love: 4 + (seed % 30),
      wow: 2 + (seed % 14),
      sad: 1 + (seed % 8),
      fire: 5 + (seed % 22),
    })
  }, [postId])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY(postId)) as ReactionKey | null
      if (stored) setSelected(stored)
    } catch {
      /* ignore */
    }
  }, [postId])

  const pick = useCallback(
    (key: ReactionKey) => {
      setSelected((prev) => {
        const next = prev === key ? null : key
        try {
          if (next === null) localStorage.removeItem(STORAGE_KEY(postId))
          else localStorage.setItem(STORAGE_KEY(postId), next)
        } catch {
          /* ignore */
        }
        setCounts((c) => {
          const updated = { ...c }
          if (prev && prev !== key) updated[prev] = Math.max(0, updated[prev] - 1)
          if (next) updated[next] = (updated[next] ?? 0) + (prev === key ? 0 : 1)
          else if (prev) updated[prev] = Math.max(0, updated[prev] - 1)
          return updated
        })
        return next
      })
    },
    [postId]
  )

  return (
    <section
      aria-label="Haberi nasıl buldun?"
      className="mt-8 rounded-2xl border border-border-subtle bg-bg-subtle/60 px-4 py-4"
    >
      <p className="mb-3 text-2xs font-bold uppercase tracking-widest text-text-tertiary">
        Bu haber sana nasıl hissettirdi?
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {REACTIONS.map((r) => {
          const active = selected === r.key
          const count = counts[r.key]
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => pick(r.key)}
              aria-pressed={active}
              aria-label={r.label}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-transform active:scale-95',
                active
                  ? 'bg-brand-500/15 text-brand-700 ring-2 ring-brand-500/40 dark:text-brand-300'
                  : 'bg-bg-card text-text-secondary ring-1 ring-border hover:bg-bg-muted'
              )}
            >
              <span className="inline-block">{r.emoji}</span>
              <span className="text-xs tabular-nums">{count}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
