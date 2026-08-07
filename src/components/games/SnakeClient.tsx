'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Trophy } from 'lucide-react'
import {
  GRID_COLS,
  GRID_ROWS,
  SNAKE_DIFFICULTIES,
  bestScoreKey,
  type Direction,
  type SnakeDifficulty,
} from '@/lib/games/snake/config'
import { GameLevelBar } from '@/components/games/GameLevelBar'
import { GameBoardFrame, GameShell } from '@/components/games/GameShell'
import { useGameLevels } from '@/hooks/useGameLevels'
import { useGameScores } from '@/hooks/useGameScores'
import { difficultyKeyFromLevel } from '@/lib/games/progress'

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
  const { submitScore } = useGameScores('yilan')
  const { level, unlocked, selectLevel, completeLevel } = useGameLevels('yilan')
  const difficulty = difficultyKeyFromLevel(level) as SnakeDifficulty
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
  const advancedRef = useRef(false)
  const scoreSubmittedRef = useRef(false)
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
    scoreSubmittedRef.current = false
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

  const changeDifficulty = (_id: SnakeDifficulty) => {
    setSnake(START_SNAKE)
    setFood(randomFood(START_SNAKE))
    setDirection('right')
    setPendingDir('right')
    setScore(0)
    setGameOver(false)
    setPaused(false)
    setRunning(false)
  }

  useEffect(() => {
    changeDifficulty(difficulty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty])

  const scoreTarget = level === 1 ? 50 : level === 2 ? 100 : 150
  useEffect(() => {
    if (score < scoreTarget || advancedRef.current) return
    advancedRef.current = true
    completeLevel()
  }, [score, scoreTarget, completeLevel])

  useEffect(() => {
    if (scoreSubmittedRef.current) return
    if (score >= scoreTarget) {
      scoreSubmittedRef.current = true
      void submitScore(score, { won: true })
    } else if (gameOver) {
      scoreSubmittedRef.current = true
      void submitScore(score, { won: false })
    }
  }, [score, scoreTarget, gameOver, submitScore])

  useEffect(() => {
    advancedRef.current = false
    scoreSubmittedRef.current = false
  }, [level])

  const cellKey = (x: number, y: number) => `${x}-${y}`
  const snakeSet = useMemo(() => new Set(snake.map((p) => cellKey(p.x, p.y))), [snake])

  return (
    <GameShell
      gameSlug="yilan"
      onRestart={resetGame}
      title={
        <span className="bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
          Neon Yılan
        </span>
      }
      subtitle={`Seviye ${level}/3 · hedef skor ${scoreTarget} · ok tuşları veya kaydır`}
      stats={
        <>
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5 text-sm font-semibold tabular-nums">
            Skor {score}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5 text-sm font-semibold tabular-nums">
            <Trophy className="h-4 w-4 text-amber-500" />
            {best}
          </span>
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
        </>
      }
    >
      <GameLevelBar
        current={level}
        unlocked={unlocked}
        onSelect={selectLevel}
        hint={`Hedef: ${scoreTarget} puan`}
      />

      <GameBoardFrame
        cols={GRID_COLS}
        rows={GRID_ROWS}
        className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-2 shadow-[0_0_40px_rgba(139,92,246,0.25)]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="grid h-full w-full gap-[2px] rounded-xl bg-black/40 p-1"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))`,
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
                className={`min-h-0 min-w-0 rounded-[2px] ${
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
      </GameBoardFrame>

      <p className="mt-3 text-center text-xs text-[rgb(var(--color-muted))]">
        WASD / ok tuşları · Mobilde kaydır · Her yem +10 puan
      </p>
    </GameShell>
  )
}
