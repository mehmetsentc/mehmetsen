'use client'

import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react'
import { Trophy } from 'lucide-react'
import {
  canMove,
  maxTile,
  move,
  newGame,
  spawnTile,
  type Dir,
  type Grid,
} from '@/lib/games/twenty48/engine'
import { GameLevelBar } from '@/components/games/GameLevelBar'
import { GameBoardFrame, GameShell } from '@/components/games/GameShell'
import { useGameLevels } from '@/hooks/useGameLevels'
import { useGameScores } from '@/hooks/useGameScores'

const TILE_CLASS: Record<number, string> = {
  0: 'bg-[rgb(var(--color-surface))]',
  2: 'bg-stone-200 text-stone-800',
  4: 'bg-stone-300 text-stone-900',
  8: 'bg-orange-400 text-white',
  16: 'bg-orange-500 text-white',
  32: 'bg-orange-600 text-white',
  64: 'bg-rose-500 text-white',
  128: 'bg-amber-400 text-white',
  256: 'bg-amber-500 text-white',
  512: 'bg-yellow-400 text-stone-900',
  1024: 'bg-yellow-500 text-stone-900',
  2048: 'bg-emerald-500 text-white',
}

function tileClass(v: number): string {
  if (TILE_CLASS[v]) return TILE_CLASS[v]!
  return 'bg-emerald-700 text-white'
}

export function Twenty48Client() {
  const { submitScore } = useGameScores('2048')
  const { level, unlocked, selectLevel, completeLevel } = useGameLevels('2048')
  const targetTile = level === 1 ? 256 : level === 2 ? 512 : 2048
  const [grid, setGrid] = useState<Grid>(() => newGame())
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [won, setWon] = useState(false)
  const [over, setOver] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const advancedRef = useRef(false)
  const scoreSubmittedRef = useRef(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('nahaber-2048-best')
      if (stored) setBest(Number(stored) || 0)
    } catch {
      /* ignore */
    }
  }, [])

  const restart = useCallback(() => {
    setGrid(newGame())
    setScore(0)
    setWon(false)
    setOver(false)
    advancedRef.current = false
    scoreSubmittedRef.current = false
  }, [])

  useEffect(() => {
    restart()
  }, [level, restart])

  useEffect(() => {
    if (!won || advancedRef.current) return
    advancedRef.current = true
    completeLevel()
  }, [won, completeLevel])

  useEffect(() => {
    if (scoreSubmittedRef.current) return
    if (won) {
      scoreSubmittedRef.current = true
      void submitScore(score, { won: true })
    } else if (over) {
      scoreSubmittedRef.current = true
      void submitScore(score, { won: false })
    }
  }, [won, over, score, submitScore])

  const applyMove = useCallback(
    (dir: Dir) => {
      if (over) return
      const result = move(grid, dir)
      if (!result.moved) return
      const withSpawn = spawnTile(result.grid)
      const nextScore = score + result.score
      setGrid(withSpawn)
      setScore(nextScore)
      if (nextScore > best) {
        setBest(nextScore)
        try {
          localStorage.setItem('nahaber-2048-best', String(nextScore))
        } catch {
          /* ignore */
        }
      }
      if (!won && maxTile(withSpawn) >= targetTile) setWon(true)
      if (!canMove(withSpawn)) setOver(true)
    },
    [best, grid, over, score, won, targetTile]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      }
      const dir = map[e.key]
      if (!dir) return
      e.preventDefault()
      applyMove(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applyMove])

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStart.current
    const t = e.changedTouches[0]
    if (!start || !t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    if (Math.abs(dx) > Math.abs(dy)) applyMove(dx > 0 ? 'right' : 'left')
    else applyMove(dy > 0 ? 'down' : 'up')
    touchStart.current = null
  }

  return (
    <GameShell
      gameSlug="2048"
      title="2048"
      onRestart={restart}
      subtitle={`Seviye ${level}/3 · hedef ${targetTile} · kaydır`}
      stats={
        <>
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5 text-sm font-semibold tabular-nums">
            Skor {score}
          </span>
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5 text-sm font-semibold tabular-nums">
            En iyi {best}
          </span>
        </>
      }
    >
      <GameLevelBar
        current={level}
        unlocked={unlocked}
        onSelect={selectLevel}
        hint={`Hedef taş: ${targetTile}`}
      />

      {won && !over && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 font-semibold text-emerald-700">
          <Trophy className="h-5 w-5" />
          {targetTile}’e ulaştın!
          {level < 3 ? ' Sonraki seviye açıldı.' : ''}
        </div>
      )}
      {over && (
        <div className="mb-4 rounded-xl bg-rose-500/15 px-4 py-3 text-center font-semibold text-rose-700">
          Oyun bitti — skor {score}
        </div>
      )}

      <GameBoardFrame
        cols={4}
        rows={4}
        className="touch-none rounded-2xl bg-stone-400/30 p-2"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="grid h-full w-full gap-2"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
          }}
        >
          {grid.map((row, r) =>
            row.map((v, c) => (
              <div
                key={`${r}-${c}`}
                className={`flex min-h-0 min-w-0 items-center justify-center rounded-lg font-black text-[clamp(0.85rem,4.5vmin,1.75rem)] ${tileClass(v)}`}
              >
                {v || ''}
              </div>
            ))
          )}
        </div>
      </GameBoardFrame>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:hidden">
        <div />
        <button
          type="button"
          onClick={() => applyMove('up')}
          className="rounded-lg border border-[rgb(var(--color-border))] py-2 font-bold"
        >
          ↑
        </button>
        <div />
        <button
          type="button"
          onClick={() => applyMove('left')}
          className="rounded-lg border border-[rgb(var(--color-border))] py-2 font-bold"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => applyMove('down')}
          className="rounded-lg border border-[rgb(var(--color-border))] py-2 font-bold"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => applyMove('right')}
          className="rounded-lg border border-[rgb(var(--color-border))] py-2 font-bold"
        >
          →
        </button>
      </div>
    </GameShell>
  )
}
