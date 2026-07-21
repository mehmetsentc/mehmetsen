'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Pause, Play, RotateCcw, Trophy } from 'lucide-react'
import {
  GRID_COLS,
  GRID_ROWS,
  SNAKE_DIFFICULTIES,
  bestScoreKey,
  type Direction,
  type SnakeDifficulty,
} from '@/lib/games/snake/config'
import { ROUTES } from '@/constants/routes'

type Point = { x: number; y: number }

function randomFood(snake: Point[]): Point {
  const occupied = new Set(snake.map((p) => `${p.x},${p.y}`))
  let x = 0
  let y = 0
  do {
    x = Math.floor(Math.random() * GRID_COLS)
    y = Math.floor(Math.random() * GRID_ROWS)
  } while (occupied.has(`${x},${y}`))
  return { x, y }
}

function opposite(a: Direction, b: Direction): boolean {
  return (
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up') ||
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left')
  )
}

const START_SNAKE: Point[] = [
  { x: 9, y: 11 },
  { x: 8, y: 11 },
  { x: 7, y: 11 },
]

export function SnakeClient() {
  const [difficulty, setDifficulty] = useState<SnakeDifficulty>('medium')
  const [snake, setSnake] = useState<Point[]>(START_SNAKE)
  const [food, setFood] = useState<Point>(() => randomFood(START_SNAKE))
  const [direction, setDirection] = useState<Direction>('right')
  const [pendingDir, setPendingDir] = useState<Direction>('right')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [running, setRunning] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [paused, setPaused] = useState(false)

  const dirRef = useRef(direction)
  const pendingRef = useRef(pendingDir)
  const foodRef = useRef(food)
  dirRef.current = direction
  pendingRef.current = pendingDir
  foodRef.current = food

  const diffConfig = useMemo(
    () => SNAKE_DIFFICULTIES.find((d) => d.id === difficulty)!,
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

  const resetGame = useCallback(() => {
    setSnake(START_SNAKE)
    setFood(randomFood(START_SNAKE))
    setDirection('right')
    setPendingDir('right')
    setScore(0)
    setGameOver(false)
    setPaused(false)
    setRunning(true)
  }, [])

  const queueDirection = useCallback((next: Direction) => {
    setPendingDir((prev) => {
      if (opposite(prev, next)) return prev
      return next
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right',
      }
      const next = map[e.key]
      if (!next) return
      e.preventDefault()
      queueDirection(next)
      if (!running && !gameOver) setRunning(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameOver, queueDirection, running])

  useEffect(() => {
    if (!running || paused || gameOver) return

    const id = window.setInterval(() => {
      setDirection(pendingRef.current)
      setSnake((prev) => {
        const head = prev[0]
        const dir = pendingRef.current
        let nx = head.x
        let ny = head.y
        if (dir === 'up') ny -= 1
        if (dir === 'down') ny += 1
        if (dir === 'left') nx -= 1
        if (dir === 'right') nx += 1

        if (nx < 0 || ny < 0 || nx >= GRID_COLS || ny >= GRID_ROWS) {
          setGameOver(true)
          setRunning(false)
          return prev
        }

        const f = foodRef.current
        const willEat = nx === f.x && ny === f.y
        const tail = willEat ? prev : prev.slice(0, -1)
        if (tail.some((p) => p.x === nx && p.y === ny)) {
          setGameOver(true)
          setRunning(false)
          return prev
        }

        const next = [{ x: nx, y: ny }, ...prev]
        if (willEat) {
          setFood(randomFood(next))
          setScore((s) => {
            const ns = s + 10
            setBest((b) => {
              const nb = Math.max(b, ns)
              try {
                localStorage.setItem(bestScoreKey(difficulty), String(nb))
              } catch {
                /* ignore */
              }
              return nb
            })
            return ns
          })
          return next
        }
        return next.slice(0, -1)
      })
    }, diffConfig.tickMs)

    return () => window.clearInterval(id)
  }, [diffConfig.tickMs, difficulty, gameOver, paused, running])

  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return
    if (Math.abs(dx) > Math.abs(dy)) {
      queueDirection(dx > 0 ? 'right' : 'left')
    } else {
      queueDirection(dy > 0 ? 'down' : 'up')
    }
    if (!running && !gameOver) setRunning(true)
    touchStart.current = null
  }

  const changeDifficulty = (id: SnakeDifficulty) => {
    setDifficulty(id)
    setSnake(START_SNAKE)
    setFood(randomFood(START_SNAKE))
    setDirection('right')
    setPendingDir('right')
    setScore(0)
    setGameOver(false)
    setPaused(false)
    setRunning(false)
  }

  const cellKey = (x: number, y: number) => `${x}-${y}`
  const snakeSet = useMemo(() => new Set(snake.map((p) => cellKey(p.x, p.y))), [snake])

  return (
    <div className="mx-auto max-w-lg px-4 py-6 pb-16">
      <Link
        href={ROUTES.GAMES}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Tüm oyunlar
      </Link>

      <header className="mb-4">
        <h1 className="bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-3xl font-black text-transparent">
          Neon Yılan
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          Renkli, hızlı, üç zorlukta — ok tuşları veya kaydır
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {SNAKE_DIFFICULTIES.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => changeDifficulty(d.id)}
            className={`rounded-xl px-3 py-2 text-left transition ${
              difficulty === d.id
                ? `bg-gradient-to-r ${d.accent} text-white shadow-lg`
                : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]'
            }`}
          >
            <span className="block text-xs font-bold uppercase tracking-wide">{d.label}</span>
            <span className="block text-[10px] opacity-90">{d.description}</span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between rounded-xl bg-[rgb(var(--color-surface))] px-4 py-3">
        <div>
          <p className="text-xs text-[rgb(var(--color-muted))]">Skor</p>
          <p className="text-2xl font-black tabular-nums text-[rgb(var(--color-text))]">{score}</p>
        </div>
        <div className="flex items-center gap-1 text-[rgb(var(--color-muted))]">
          <Trophy className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold tabular-nums">{best}</span>
        </div>
        <div className="flex gap-2">
          {!gameOver && running && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="rounded-lg border border-[rgb(var(--color-border))] p-2"
              aria-label={paused ? 'Devam' : 'Duraklat'}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={resetGame}
            className="rounded-lg bg-violet-600 p-2 text-white hover:bg-violet-700"
            aria-label="Yeniden başlat"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-2 shadow-[0_0_40px_rgba(139,92,246,0.25)]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="grid gap-[2px] rounded-xl bg-black/40 p-1"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            aspectRatio: `${GRID_COLS} / ${GRID_ROWS}`,
          }}
        >
          {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
            const x = i % GRID_COLS
            const y = Math.floor(i / GRID_COLS)
            const key = cellKey(x, y)
            const isHead = snake[0]?.x === x && snake[0]?.y === y
            const isBody = snakeSet.has(key) && !isHead
            const isFood = food.x === x && food.y === y
            return (
              <div
                key={key}
                className={`aspect-square rounded-[2px] ${
                  isHead
                    ? 'bg-gradient-to-br from-cyan-300 to-violet-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]'
                    : isBody
                      ? 'bg-gradient-to-br from-violet-500/90 to-fuchsia-600/80'
                      : isFood
                        ? 'animate-pulse bg-gradient-to-br from-rose-400 to-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.9)]'
                        : 'bg-white/[0.03]'
                }`}
              />
            )
          })}
        </div>

        {!running && !gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <p className="mb-3 text-center text-sm font-medium text-white/90">
              Başlamak için oyna veya ok tuşlarına bas
            </p>
            <button
              type="button"
              onClick={resetGame}
              className={`rounded-xl bg-gradient-to-r ${diffConfig.accent} px-6 py-3 text-sm font-bold text-white shadow-lg`}
            >
              Oyna
            </button>
          </div>
        )}

        {paused && !gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <p className="text-lg font-bold text-white">Duraklatıldı</p>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
            <p className="text-xl font-black text-white">Oyun bitti</p>
            <p className="mt-1 text-sm text-violet-200">Skor: {score}</p>
            <button
              type="button"
              onClick={resetGame}
              className={`mt-4 rounded-xl bg-gradient-to-r ${diffConfig.accent} px-6 py-2.5 text-sm font-bold text-white`}
            >
              Tekrar dene
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-[rgb(var(--color-muted))]">
        WASD / ok tuşları · Mobilde kaydır · Her yem +10 puan
      </p>
    </div>
  )
}
