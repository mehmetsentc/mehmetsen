'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Trophy, X } from 'lucide-react'
import { getGameRules, rulesSeenKey } from '@/constants/gameRules'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface GameRulesSheetProps {
  gameSlug: string
  dark?: boolean
  /** true ise ilk açılışta otomatik göster */
  autoOpen?: boolean
}

export function GameRulesSheet({ gameSlug, dark, autoOpen = true }: GameRulesSheetProps) {
  const rules = getGameRules(gameSlug)
  const { user } = useAuth()
  const userId = user?.uid ?? 'guest'
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!rules || !autoOpen) return
    try {
      const seen = localStorage.getItem(rulesSeenKey(gameSlug, userId))
      if (!seen) setOpen(true)
    } catch {
      setOpen(true)
    }
  }, [autoOpen, gameSlug, rules, userId])

  if (!rules) return null

  const dismiss = () => {
    setOpen(false)
    try {
      localStorage.setItem(rulesSeenKey(gameSlug, userId), '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'mb-3 inline-flex w-fit items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold',
          dark
            ? 'border-white/20 bg-white/10 text-white hover:bg-white/15'
            : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-card))]'
        )}
      >
        <BookOpen className="h-3.5 w-3.5" />
        Nasıl oynanır?
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-rules-title"
        >
          <div
            className={cn(
              'flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl',
              dark ? 'bg-slate-900 text-white' : 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]'
            )}
          >
            <div
              className={cn(
                'flex items-center justify-between border-b px-5 py-4',
                dark ? 'border-white/10' : 'border-[rgb(var(--color-border))]'
              )}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[rgb(var(--color-brand))]" />
                <h2 id="game-rules-title" className="text-base font-black">
                  {rules.title} — nasıl oynanır?
                </h2>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className={cn(
                  'rounded-full p-1.5',
                  dark ? 'text-white/60 hover:bg-white/10' : 'text-[rgb(var(--color-muted))]'
                )}
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-5 text-sm leading-relaxed">
              <div>
                <p className={cn('mb-1 text-xs font-bold uppercase tracking-wide', dark ? 'text-white/50' : 'text-[rgb(var(--color-muted))]')}>
                  Amaç
                </p>
                <p className="text-base font-semibold">{rules.goal}</p>
              </div>

              <div>
                <p className={cn('mb-1.5 text-xs font-bold uppercase tracking-wide', dark ? 'text-white/50' : 'text-[rgb(var(--color-muted))]')}>
                  Nasıl?
                </p>
                <ol className="list-decimal space-y-2 pl-5">
                  {rules.how.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </div>

              <div>
                <p className={cn('mb-1 text-xs font-bold uppercase tracking-wide', dark ? 'text-white/50' : 'text-[rgb(var(--color-muted))]')}>
                  Ne zaman biter?
                </p>
                <p>{rules.win}</p>
              </div>

              <div
                className={cn(
                  'flex items-start gap-2 rounded-2xl px-3 py-3 text-xs',
                  dark ? 'bg-white/10' : 'bg-[rgb(var(--color-surface))]'
                )}
              >
                <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p>
                  <span className="font-bold">Sıralama: </span>
                  {rules.ranking} Skorun üye hesabına kaydedilir.
                </p>
              </div>
            </div>

            <div className={cn('border-t px-5 py-4', dark ? 'border-white/10' : 'border-[rgb(var(--color-border))]')}>
              <button
                type="button"
                onClick={dismiss}
                className="w-full rounded-2xl bg-[rgb(var(--color-brand))] py-3 text-sm font-bold text-white"
              >
                Anladım, oyna
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
