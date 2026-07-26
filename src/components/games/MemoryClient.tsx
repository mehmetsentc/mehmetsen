'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react'
import { createDeck, type MemoryCard } from '@/lib/games/memory/engine'
import { GameLevelBar } from '@/components/games/GameLevelBar'
import { useGameLevels } from '@/hooks/useGameLevels'
import { ROUTES } from '@/constants/routes'
import type { GameLevelId } from '@/lib/games/progress'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function pairsForLevel(level: GameLevelId): number {
  if (level === 1) return 4
  if (level === 2) return 6
  return 8
}

export function MemoryClient() {
  const { level, unlocked, selectLevel, completeLevel } = useGameLevels('hafiza')
  const pairCount = pairsForLevel(level)
  const [cards, setCards] = useState<MemoryCard[]>(() => createDeck(4))
  const [flipped, setFlipped] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [lock, setLock] = useState(false)
  const [won, setWon] = useState(false)
  const advancedRef = useRef(false)

  const restart = useCallback(() => {
    setCards(createDeck(pairCount))
    setFlipped([])
    setMoves(0)
    setSeconds(0)
    setLock(false)
    setWon(false)
    advancedRef.current = false
  }, [pairCount])

  useEffect(() => {
    restart()
  }, [restart])

  useEffect(() => {
    if (won) return
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [won])

  useEffect(() => {
    if (cards.length > 0 && cards.every((c) => c.matched)) setWon(true)
  }, [cards])

  useEffect(() => {
    if (!won || advancedRef.current) return
    advancedRef.current = true
    completeLevel()
  }, [won, completeLevel])

  const flip = (index: number) => {
    if (lock || won) return
    const card = cards[index]
    if (!card || card.matched || flipped.includes(index)) return
    if (flipped.length >= 2) return

    const nextFlipped = [...flipped, index]
    setFlipped(nextFlipped)

    if (nextFlipped.length === 2) {
      setMoves((m) => m + 1)
      const [a, b] = nextFlipped
      const ca = cards[a!]!
      const cb = cards[b!]!
      if (ca.emoji === cb.emoji) {
        setCards((prev) =>
          prev.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c))
        )
        setFlipped([])
      } else {
        setLock(true)
        window.setTimeout(() => {
          setFlipped([])
          setLock(false)
        }, 700)
      }
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 pb-20">
      <Link
        href={ROUTES.GAMES}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Tüm oyunlar
      </Link>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[rgb(var(--color-text))]">Hafıza</h1>
          <p className="text-sm text-[rgb(var(--color-muted))]">
            Eşleşen kartları bul · {pairCount} çift
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold tabular-nums">
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5">
            {formatTime(seconds)}
          </span>
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5">
            {moves} hamle
          </span>
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Yeni
          </button>
        </div>
      </header>

      <GameLevelBar
        current={level}
        unlocked={unlocked}
        onSelect={selectLevel}
        hint="Kazanınca sonraki seviye açılır"
      />

      {won && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-sky-500/15 px-4 py-3 font-semibold text-sky-700">
          <Trophy className="h-5 w-5" />
          Tebrikler! {moves} hamlede · {formatTime(seconds)}
          {level < 3 ? ' · Sonraki seviye açıldı!' : ''}
        </div>
      )}

      <div className={`grid gap-2 ${pairCount <= 4 ? 'grid-cols-4' : 'grid-cols-4'}`}>
        {cards.map((card, index) => {
          const open = card.matched || flipped.includes(index)
          return (
            <button
              key={`${card.id}-${index}`}
              type="button"
              onClick={() => flip(index)}
              disabled={open || lock || won}
              className={`aspect-square rounded-xl border text-3xl transition ${
                open
                  ? 'border-sky-500/40 bg-sky-500/10'
                  : 'border-[rgb(var(--color-border))] bg-gradient-to-br from-sky-600 to-indigo-800 text-white'
              }`}
              aria-label={open ? card.emoji : 'Kapalı kart'}
            >
              {open ? card.emoji : '?'}
            </button>
          )
        })}
      </div>
    </div>
  )
}
