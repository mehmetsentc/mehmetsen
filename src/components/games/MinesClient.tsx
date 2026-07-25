'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { ArrowLeft, Flag, RotateCcw, Trophy } from 'lucide-react'
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
import { ROUTES } from '@/constants/routes'

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
  const [difficulty, setDifficulty] = useState<MinesDifficulty>('easy')
  const config = MINES_DIFFICULTIES.find((d) => d.id === difficulty)!
  const [board, setBoard] = useState<Board>(() => createEmptyBoard(config.rows, config.cols))
  const [started, setStarted] = useState(false)
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing')
  const [flagMode, setFlagMode] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const restart = useCallback((diff: MinesDifficulty = difficulty) => {
    const cfg = MINES_DIFFICULTIES.find((d) => d.id === diff)!
    setDifficulty(diff)
    setBoard(createEmptyBoard(cfg.rows, cfg.cols))
    setStarted(false)
    setStatus('playing')
    setSeconds(0)
  }, [difficulty])

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
    <div className="mx-auto max-w-lg px-4 py-6 pb-20">
      <Link
        href={ROUTES.GAMES}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Tüm oyunlar
      </Link>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[rgb(var(--color-text))]">Mayın Tarlası</h1>
          <p className="text-sm text-[rgb(var(--color-muted))]">
            Sol tık aç · sağ tık / bayrak modu işaretle
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold tabular-nums">
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5">
            💣 {remaining}
          </span>
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5">{seconds}s</span>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {MINES_DIFFICULTIES.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => restart(d.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              difficulty === d.id
                ? 'bg-stone-700 text-white'
                : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
            }`}
          >
            {d.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setFlagMode((f) => !f)}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${
            flagMode
              ? 'bg-amber-500 text-white'
              : 'border border-[rgb(var(--color-border))]'
          }`}
        >
          <Flag className="h-3.5 w-3.5" />
          Bayrak
        </button>
        <button
          type="button"
          onClick={() => restart()}
          className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold"
        >
          <RotateCcw className="h-3.5 w-3.5" />
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

      <div
        className="mx-auto inline-grid gap-0.5 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-1"
        style={{ gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))` }}
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
                className={`flex h-7 w-7 items-center justify-center text-xs font-black sm:h-8 sm:w-8 ${
                  show
                    ? cell.mine
                      ? 'bg-rose-600 text-white'
                      : 'bg-[rgb(var(--color-card))]'
                    : 'bg-stone-400/40 hover:bg-stone-400/60'
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
    </div>
  )
}
