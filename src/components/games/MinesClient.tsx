'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Flag, RotateCcw, Trophy } from 'lucide-react'
import {
  MINES_DIFFICULTIES,
  countFlags,
  createEmptyBoard,
  isWin,
  placeMines,
  revealAllMines,
  revealCell,
  toggleFlag,
  type Board,
  type MinesDifficulty,
} from '@/lib/games/mines/engine'
import { GameLevelBar } from '@/components/games/GameLevelBar'
import { GameBoardFrame, GameShell } from '@/components/games/GameShell'
import { useGameLevels } from '@/hooks/useGameLevels'
import { useGameScores } from '@/hooks/useGameScores'
import { difficultyKeyFromLevel } from '@/lib/games/progress'

const NUM_COLORS = [
  '',
  'text-blue-600',
  'text-emerald-600',
  'text-rose-600',
  'text-violet-700',
  'text-amber-700',
  'text-cyan-700',
  'text-zinc-800',
  'text-zinc-500',
]

export function MinesClient() {
  const { submitScore } = useGameScores('mayin')
  const { level, unlocked, selectLevel, completeLevel } = useGameLevels('mayin')
  const difficulty = difficultyKeyFromLevel(level) as MinesDifficulty
  const config = MINES_DIFFICULTIES.find((d) => d.id === difficulty)!
  const [board, setBoard] = useState<Board>(() =>
    createEmptyBoard(MINES_DIFFICULTIES[0]!.rows, MINES_DIFFICULTIES[0]!.cols)
  )
  const [started, setStarted] = useState(false)
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing')
  const [flagMode, setFlagMode] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const advancedRef = useRef(false)

  const restart = useCallback((diff: MinesDifficulty = difficulty) => {
    const cfg = MINES_DIFFICULTIES.find((d) => d.id === diff)!
    setBoard(createEmptyBoard(cfg.rows, cfg.cols))
    setStarted(false)
    setStatus('playing')
    setSeconds(0)
    advancedRef.current = false
  }, [difficulty])

  useEffect(() => {
    restart(difficulty)
  }, [difficulty, restart])

  useEffect(() => {
    if (status !== 'won' || advancedRef.current) return
    advancedRef.current = true
    completeLevel()
    void submitScore(seconds, { won: true })
  }, [status, completeLevel, seconds, submitScore])

  useEffect(() => {
    if (status !== 'playing' || !started) return
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [status, started])

  const onCell = (r: number, c: number) => {
    if (status !== 'playing') return
    if (flagMode) {
      setBoard((b) => toggleFlag(b, r, c))
      return
    }
    const cell = board[r]![c]!
    if (cell.flagged) return

    let next = board
    if (!started) {
      next = placeMines(board, config.mines, r, c)
      setStarted(true)
    }
    next = revealCell(next, r, c)
    if (next[r]![c]!.mine && next[r]![c]!.revealed) {
      setBoard(revealAllMines(next))
      setStatus('lost')
      return
    }
    setBoard(next)
    if (isWin(next)) setStatus('won')
  }

  const onRightClick = (e: MouseEvent, r: number, c: number) => {
    e.preventDefault()
    if (status !== 'playing') return
    setBoard((b) => toggleFlag(b, r, c))
  }

  const flags = countFlags(board)
  const remaining = config.mines - flags

  return (
    <GameShell
      gameSlug="mayin"
      title="Mayın Tarlası"
      subtitle="Sol tık aç · sağ tık / bayrak modu işaretle"
      stats={
        <>
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5 text-sm font-semibold tabular-nums">
            💣 {remaining}
          </span>
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5 text-sm font-semibold tabular-nums">
            {seconds}s
          </span>
        </>
      }
    >
      <GameLevelBar
        current={level}
        unlocked={unlocked}
        onSelect={selectLevel}
        hint="Kazanınca sonraki seviye açılır"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFlagMode((f) => !f)}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold ${
            flagMode
              ? 'bg-amber-500 text-white'
              : 'border border-[rgb(var(--color-border))]'
          }`}
        >
          <Flag className="h-4 w-4" />
          Bayrak
        </button>
        <button
          type="button"
          onClick={() => restart()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-semibold"
        >
          <RotateCcw className="h-4 w-4" />
          Yeni
        </button>
      </div>

      {status === 'won' && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 font-semibold text-emerald-700">
          <Trophy className="h-5 w-5" />
          Temizledin! {seconds}s
        </div>
      )}
      {status === 'lost' && (
        <div className="mb-4 rounded-xl bg-rose-500/15 px-4 py-3 text-center font-semibold text-rose-700">
          Mayına bastın
        </div>
      )}

      <GameBoardFrame
        cols={config.cols}
        rows={config.rows}
        className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-1 sm:p-1.5"
      >
        <div
          className="grid h-full w-full gap-0.5 sm:gap-1"
          style={{
            gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${config.rows}, minmax(0, 1fr))`,
          }}
        >
          {board.map((row, r) =>
            row.map((cell, c) => {
              const show = cell.revealed
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  onClick={() => onCell(r, c)}
                  onContextMenu={(e) => onRightClick(e, r, c)}
                  className={`flex min-h-0 min-w-0 items-center justify-center rounded-sm text-[clamp(0.65rem,2.8vmin,1.25rem)] font-black sm:rounded-md ${
                    show
                      ? cell.mine
                        ? 'bg-rose-600 text-white'
                        : 'bg-[rgb(var(--color-card))]'
                      : 'bg-stone-400/40 hover:bg-stone-400/60 active:bg-stone-400/70'
                  } ${show && cell.adjacent > 0 ? NUM_COLORS[cell.adjacent] : ''}`}
                >
                  {show
                    ? cell.mine
                      ? '💣'
                      : cell.adjacent > 0
                        ? cell.adjacent
                        : ''
                    : cell.flagged
                      ? '🚩'
                      : ''}
                </button>
              )
            })
          )}
        </div>
      </GameBoardFrame>
    </GameShell>
  )
}
