'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, Trophy } from 'lucide-react'
import { createDeck, type MemoryCard } from '@/lib/games/memory/engine'
import { GameLevelBar } from '@/components/games/GameLevelBar'
import { GameBoardFrame, GameShell } from '@/components/games/GameShell'
import { useGameLevels } from '@/hooks/useGameLevels'
import { useGameScores } from '@/hooks/useGameScores'
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
  const { submitScore } = useGameScores('hafiza')
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
    void submitScore(seconds, { won: true })
  }, [won, completeLevel, seconds, submitScore])

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

  const gridRows = Math.ceil(cards.length / 4)

  return (
    <GameShell
      gameSlug="hafiza"
      title="Hafıza"
      subtitle={`Eşleşen kartları bul · ${pairCount} çift`}
      stats={
        <>
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5 text-sm font-semibold tabular-nums">
            {formatTime(seconds)}
          </span>
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5 text-sm font-semibold tabular-nums">
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
        </>
      }
    >
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

      <GameBoardFrame cols={4} rows={gridRows}>
        <div
          className="grid h-full w-full gap-2"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
          }}
        >
          {cards.map((card, index) => {
            const open = card.matched || flipped.includes(index)
            return (
              <button
                key={`${card.id}-${index}`}
                type="button"
                onClick={() => flip(index)}
                disabled={open || lock || won}
                className={`flex min-h-0 min-w-0 items-center justify-center rounded-xl border text-[clamp(1.25rem,6vmin,2.25rem)] transition ${
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
      </GameBoardFrame>
    </GameShell>
  )
}
