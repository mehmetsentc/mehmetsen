'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Pause,
  Play,
  RotateCcw,
  Trophy,
} from 'lucide-react'
import {
  COLS,
  PIECE_COLORS,
  ROWS,
  TETRIS_DIFFICULTIES,
  TOTAL_ROWS,
  bestScoreKey,
  cellsForRender,
  createInitialState,
  ghostY,
  hardDrop,
  hold,
  move,
  rotate,
  softDrop,
  tick,
  tickMsForLevel,
  type CellColor,
  type PieceType,
  type TetrisDifficulty,
  type TetrisState,
} from '@/lib/games/tetris/engine'
import { ROUTES } from '@/constants/routes'

const PREVIEW: Record<PieceType, { x: number; y: number }[]> = {
  I: [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
  ],
  O: [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ],
  T: [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ],
  S: [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
  Z: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ],
  J: [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ],
  L: [
    { x: 2, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ],
}

function PiecePreview({ type, label }: { type: PieceType | null; label: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2 backdrop-blur">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</p>
      {!type ? (
        <div className="h-10 w-14" />
      ) : (
        <div className="relative h-10 w-14">
          {PREVIEW[type].map((p, i) => (
            <span
              key={i}
              className="absolute h-2.5 w-2.5 rounded-sm"
              style={{
                left: `${p.x * 11}px`,
                top: `${p.y * 11}px`,
                background: PIECE_COLORS[type],
                boxShadow: `0 0 8px ${PIECE_COLORS[type]}88`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function TetrisClient() {
  const [difficulty, setDifficulty] = useState<TetrisDifficulty>('medium')
  const [state, setState] = useState<TetrisState>(() => createInitialState())
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [best, setBest] = useState(0)
  const softRef = useRef(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const diff = useMemo(
    () => TETRIS_DIFFICULTIES.find((d) => d.id === difficulty)!,
    [difficulty]
  )

  useEffect(() => {
    try {
      const raw = localStorage.getItem(bestScoreKey(difficulty))
      setBest(raw ? Number.parseInt(raw, 10) || 0 : 0)
    } catch {
      setBest(0)
    }
  }, [difficulty])

  useEffect(() => {
    if (!state.gameOver) return
    setBest((b) => {
      const nb = Math.max(b, state.score)
      try {
        localStorage.setItem(bestScoreKey(difficulty), String(nb))
      } catch {
        /* ignore */
      }
      return nb
    })
    setRunning(false)
  }, [state.gameOver, state.score, difficulty])

  const reset = useCallback((diffId?: TetrisDifficulty) => {
    if (diffId) setDifficulty(diffId)
    setState(createInitialState())
    setPaused(false)
    setRunning(true)
  }, [])

  useEffect(() => {
    if (!running || paused || state.gameOver) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const need = softRef.current
        ? diff.softDropMs
        : tickMsForLevel(diff.baseTickMs, state.level)
      if (now - last < need) return
      last = now
      setState((s) => (softRef.current ? softDrop(s) : tick(s)))
    }, 16)
    return () => window.clearInterval(id)
  }, [running, paused, state.gameOver, state.level, diff])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'c', 'C', 'p', 'P'].includes(e.key)) {
        e.preventDefault()
      }
      if (e.key === 'p' || e.key === 'P') {
        if (running && !state.gameOver) setPaused((p) => !p)
        return
      }
      if (!running || paused || state.gameOver) return
      if (e.key === 'ArrowLeft') setState((s) => move(s, -1))
      if (e.key === 'ArrowRight') setState((s) => move(s, 1))
      if (e.key === 'ArrowUp' || e.key === 'x' || e.key === 'X') setState((s) => rotate(s, 1))
      if (e.key === 'z' || e.key === 'Z') setState((s) => rotate(s, -1))
      if (e.key === ' ') setState((s) => hardDrop(s))
      if (e.key === 'c' || e.key === 'C') setState((s) => hold(s))
      if (e.key === 'ArrowDown') softRef.current = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') softRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [running, paused, state.gameOver])

  const ghost = ghostY(state)
  const activeCells = state.active ? cellsForRender(state.active) : []
  const ghostCells =
    state.active && ghost !== null ? cellsForRender({ ...state.active, y: ghost }) : []

  const displayBoard: CellColor[][] = useMemo(
    () => state.board.slice(TOTAL_ROWS - ROWS),
    [state.board]
  )

  const cellAt = (displayRow: number, col: number): { color: string | null; ghost: boolean } => {
    const boardRow = displayRow + (TOTAL_ROWS - ROWS)
    const locked = displayBoard[displayRow]?.[col]
    if (locked) return { color: PIECE_COLORS[locked], ghost: false }
    if (activeCells.some((c) => c.x === col && c.y === boardRow)) {
      return { color: PIECE_COLORS[state.active!.type], ghost: false }
    }
    if (ghostCells.some((c) => c.x === col && c.y === boardRow)) {
      return { color: PIECE_COLORS[state.active!.type], ghost: true }
    }
    return { color: null, ghost: false }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-slate-950 text-white">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-40 ${diff.accent}`} />
      <div className="pointer-events-none absolute -left-20 top-20 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-32 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />

      <div className="relative mx-auto max-w-lg px-4 py-6 pb-24">
        <Link
          href={ROUTES.GAMES}
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white"
        >
          ← Tüm oyunlar
        </Link>

        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              Neon{' '}
              <span className="bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-transparent">
                Tetris
              </span>
            </h1>
            <p className="text-sm text-white/60">Modern blok düşürme · 3 zorluk</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-semibold">
            <Trophy className="h-3.5 w-3.5 text-amber-300" />
            {best}
          </span>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          {TETRIS_DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => reset(d.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                difficulty === d.id
                  ? `bg-gradient-to-r ${d.accent} text-white shadow-lg`
                  : 'bg-white/10 text-white/70 hover:bg-white/15'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <PiecePreview type={state.hold} label="Tut" />
            <PiecePreview type={state.next} label="Sıradaki" />
          </div>
          <div className="text-right text-sm">
            <p className="text-2xl font-black tabular-nums">{state.score}</p>
            <p className="text-white/50">
              Satır {state.lines} · Lv {state.level}
            </p>
          </div>
        </div>

        <div
          className="relative mx-auto overflow-hidden rounded-2xl border border-white/15 bg-black/50 p-1.5 shadow-2xl shadow-fuchsia-500/10"
          style={{ width: 'min(100%, 320px)' }}
          onTouchStart={(e) => {
            const t = e.touches[0]
            touchStart.current = { x: t.clientX, y: t.clientY }
          }}
          onTouchEnd={(e) => {
            if (!touchStart.current || !running || paused || state.gameOver) return
            const t = e.changedTouches[0]
            const dx = t.clientX - touchStart.current.x
            const dy = t.clientY - touchStart.current.y
            touchStart.current = null
            if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
              setState((s) => rotate(s, 1))
              return
            }
            if (Math.abs(dx) > Math.abs(dy)) {
              setState((s) => move(s, dx > 0 ? 1 : -1))
            } else if (dy > 0) {
              setState((s) => softDrop(s))
            } else {
              setState((s) => hardDrop(s))
            }
          }}
        >
          <div
            className="grid gap-px rounded-xl bg-slate-900/80 p-px"
            style={{
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gridTemplateRows: `repeat(${ROWS}, 1fr)`,
              aspectRatio: `${COLS} / ${ROWS}`,
            }}
          >
            {Array.from({ length: ROWS * COLS }, (_, i) => {
              const row = Math.floor(i / COLS)
              const col = i % COLS
              const { color, ghost: isGhost } = cellAt(row, col)
              return (
                <div
                  key={i}
                  className="rounded-[2px]"
                  style={{
                    background: color
                      ? isGhost
                        ? `${color}33`
                        : color
                      : row % 2 === 0
                        ? '#0f172a88'
                        : '#02061788',
                    boxShadow:
                      color && !isGhost
                        ? `inset 0 0 6px ${color}aa, 0 0 4px ${color}55`
                        : undefined,
                  }}
                />
              )
            })}
          </div>

          {(paused || !running || state.gameOver) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/75 backdrop-blur-sm">
              {state.gameOver ? (
                <>
                  <p className="text-xl font-black">Oyun bitti</p>
                  <p className="text-white/60">Skor: {state.score}</p>
                  <button
                    type="button"
                    onClick={() => reset()}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-slate-950"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Tekrar oyna
                  </button>
                </>
              ) : !running ? (
                <button
                  type="button"
                  onClick={() => reset()}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-6 py-3 text-sm font-black text-slate-950"
                >
                  <Play className="h-4 w-4" />
                  Başla
                </button>
              ) : (
                <>
                  <p className="text-lg font-bold">Duraklatıldı</p>
                  <button
                    type="button"
                    onClick={() => setPaused(false)}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold"
                  >
                    <Play className="h-4 w-4" />
                    Devam
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => running && !state.gameOver && setPaused((p) => !p)}
            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? 'Devam' : 'Duraklat'}
          </button>
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Yeniden
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 sm:hidden">
          <button
            type="button"
            onClick={() => setState((s) => move(s, -1))}
            className="flex items-center justify-center rounded-xl bg-white/10 py-3"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setState((s) => rotate(s, 1))}
            className="flex items-center justify-center rounded-xl bg-white/10 py-3"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setState((s) => move(s, 1))}
            className="flex items-center justify-center rounded-xl bg-white/10 py-3"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setState((s) => hardDrop(s))}
            className="flex items-center justify-center rounded-xl bg-white/10 py-3"
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-white/40">
          ← → hareket · ↑ / Z döndür · ↓ yumuşak · Space sert düşüş · C tut · P duraklat
        </p>
        <p className="mt-1 text-center text-[11px] text-white/35">{diff.description}</p>
      </div>
    </div>
  )
}
