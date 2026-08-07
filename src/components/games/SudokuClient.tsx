'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Eraser,
  Lightbulb,
  Pause,
  Play,

  Trophy,
} from 'lucide-react'
import {
  SUDOKU_DIFFICULTIES,
  cloneGrid,
  conflictMask,
  findHintCell,
  formatTime,
  generatePuzzle,
  isComplete,
  type SudokuDifficulty,
  type SudokuPuzzle,
} from '@/lib/games/sudoku/engine'
import { GameLevelBar } from '@/components/games/GameLevelBar'
import { GameBoardFrame, GameShell } from '@/components/games/GameShell'
import { useGameLevels } from '@/hooks/useGameLevels'
import { useGameScores } from '@/hooks/useGameScores'
import { difficultyKeyFromLevel } from '@/lib/games/progress'

function newGame(difficulty: SudokuDifficulty): SudokuPuzzle {
  return generatePuzzle(difficulty)
}

export function SudokuClient() {
  const { submitScore } = useGameScores('sudoku')
  const { level, unlocked, selectLevel, completeLevel } = useGameLevels('sudoku')
  const difficulty = difficultyKeyFromLevel(level) as SudokuDifficulty
  const [pack, setPack] = useState<SudokuPuzzle | null>(null)
  const [grid, setGrid] = useState<number[]>(() => Array.from({ length: 81 }, () => 0))
  const [selected, setSelected] = useState<number | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hintsLeft, setHintsLeft] = useState(3)
  const [won, setWon] = useState(false)
  const [notesMode, setNotesMode] = useState(false)
  const [notes, setNotes] = useState<Set<number>[]>(() =>
    Array.from({ length: 81 }, () => new Set())
  )
  const advancedRef = useRef(false)

  const startPuzzle = useCallback((diff: SudokuDifficulty) => {
    const next = newGame(diff)
    setPack(next)
    setGrid(cloneGrid(next.puzzle))
    setSelected(null)
    setSeconds(0)
    setPaused(false)
    setWon(false)
    setHintsLeft(SUDOKU_DIFFICULTIES.find((d) => d.id === diff)!.hintLimit)
    setNotes(Array.from({ length: 81 }, () => new Set()))
    advancedRef.current = false
  }, [])

  useEffect(() => {
    startPuzzle(difficulty)
  }, [startPuzzle, difficulty])

  useEffect(() => {
    if (!won || advancedRef.current) return
    advancedRef.current = true
    completeLevel()
    void submitScore(seconds, { won: true })
  }, [won, completeLevel, seconds, submitScore])

  useEffect(() => {
    if (!pack || paused || won) return
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [pack, paused, won])

  const conflicts = useMemo(() => conflictMask(grid), [grid])
  const config = SUDOKU_DIFFICULTIES.find((d) => d.id === difficulty)!

  const placeNumber = (num: number) => {
    if (selected === null || !pack || won || paused) return
    if (pack.given[selected]) return

    if (notesMode) {
      setNotes((prev) => {
        const next = prev.map((s) => new Set(s))
        const cell = next[selected]
        if (cell.has(num)) cell.delete(num)
        else cell.add(num)
        return next
      })
      return
    }

    setGrid((g) => {
      const next = cloneGrid(g)
      next[selected] = num
      if (isComplete(next, pack.solution)) setWon(true)
      return next
    })
    setNotes((prev) => {
      const next = prev.map((s) => new Set(s))
      next[selected] = new Set()
      return next
    })
  }

  const erase = () => {
    if (selected === null || !pack || pack.given[selected] || won || paused) return
    setGrid((g) => {
      const next = cloneGrid(g)
      next[selected] = 0
      return next
    })
    setNotes((prev) => {
      const next = prev.map((s) => new Set(s))
      next[selected] = new Set()
      return next
    })
  }

  const useHint = () => {
    if (!pack || won || paused || hintsLeft <= 0) return
    const cell = findHintCell(grid, pack.solution, pack.given)
    if (cell === null) return
    setGrid((g) => {
      const next = cloneGrid(g)
      next[cell] = pack.solution[cell]
      if (isComplete(next, pack.solution)) setWon(true)
      return next
    })
    setSelected(cell)
    setHintsLeft((h) => h - 1)
    setNotes((prev) => {
      const next = prev.map((s) => new Set(s))
      next[cell] = new Set()
      return next
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (won || paused || !pack) return
      if (e.key >= '1' && e.key <= '9') {
        const num = Number(e.key)
        if (selected === null) return
        if (pack.given[selected]) return
        if (notesMode) {
          setNotes((prev) => {
            const next = prev.map((s) => new Set(s))
            const cell = next[selected]
            if (cell.has(num)) cell.delete(num)
            else cell.add(num)
            return next
          })
          return
        }
        setGrid((g) => {
          const next = cloneGrid(g)
          next[selected] = num
          if (isComplete(next, pack.solution)) setWon(true)
          return next
        })
        setNotes((prev) => {
          const next = prev.map((s) => new Set(s))
          next[selected] = new Set()
          return next
        })
        return
      }
      if ((e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') && selected !== null) {
        if (pack.given[selected]) return
        setGrid((g) => {
          const next = cloneGrid(g)
          next[selected] = 0
          return next
        })
        setNotes((prev) => {
          const next = prev.map((s) => new Set(s))
          next[selected] = new Set()
          return next
        })
      }
      if (e.key === 'ArrowUp' && selected !== null) {
        e.preventDefault()
        setSelected(Math.max(0, selected - 9))
      }
      if (e.key === 'ArrowDown' && selected !== null) {
        e.preventDefault()
        setSelected(Math.min(80, selected + 9))
      }
      if (e.key === 'ArrowLeft' && selected !== null) {
        e.preventDefault()
        setSelected(Math.max(0, selected - 1))
      }
      if (e.key === 'ArrowRight' && selected !== null) {
        e.preventDefault()
        setSelected(Math.min(80, selected + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, won, paused, notesMode, pack])

  if (!pack) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-lg items-center justify-center px-4 py-16 text-center text-sm text-[rgb(var(--color-muted))]">
        Puzzle hazırlanıyor…
      </div>
    )
  }

  const selectedValue = selected !== null ? grid[selected] : 0

  return (
    <GameShell
      gameSlug="sudoku"
      title="Sudoku"
      subtitle="Online oyna · 9×9 · ipucu ve not modu"
      onRestart={() => startPuzzle(difficulty)}
      stats={
        <>
          <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5 text-sm font-semibold tabular-nums text-[rgb(var(--color-text))]">
            {formatTime(seconds)}
          </span>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm font-semibold hover:bg-[rgb(var(--color-surface))]"
            disabled={won}
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? 'Devam' : 'Duraklat'}
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

      <div className="mb-2" />

      {won && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-teal-500/15 px-4 py-3 font-semibold text-teal-700">
          <Trophy className="h-5 w-5" />
          Tebrikler! {config.label} sudoku {formatTime(seconds)} içinde bitti.
        </div>
      )}

      {paused && !won && (
        <div className="mb-4 rounded-xl bg-[rgb(var(--color-surface))] px-4 py-8 text-center text-sm font-medium text-[rgb(var(--color-muted))]">
          Oyun duraklatıldı
        </div>
      )}

      {!paused && (
        <GameBoardFrame
          cols={9}
          rows={9}
          className="overflow-hidden rounded-2xl border-2 border-teal-900/40 bg-teal-950 shadow-lg"
        >
          <div
            className="grid h-full w-full"
            style={{
              gridTemplateColumns: 'repeat(9, 1fr)',
              gridTemplateRows: 'repeat(9, 1fr)',
              gap: 0,
            }}
          >
          {grid.map((value, i) => {
            const row = Math.floor(i / 9)
            const col = i % 9
            const isGiven = pack.given[i]
            const isSelected = selected === i
            const sameNum = selectedValue > 0 && value === selectedValue
            const isConflict = conflicts[i]
            const thickR = col === 2 || col === 5
            const thickB = row === 2 || row === 5

            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(i)}
                className={`relative flex min-h-0 min-w-0 items-center justify-center text-[clamp(0.85rem,3.2vmin,1.5rem)] font-bold ${
                  isSelected
                    ? 'bg-teal-400/35'
                    : sameNum
                      ? 'bg-teal-500/20'
                      : (row + col) % 2 === 0
                        ? 'bg-teal-50'
                        : 'bg-white'
                } ${thickR ? 'border-r-[3px] border-r-teal-900/50' : 'border-r border-r-teal-200'} ${
                  thickB ? 'border-b-[3px] border-b-teal-900/50' : 'border-b border-b-teal-200'
                }`}
              >
                {value > 0 ? (
                  <span
                    className={
                      isConflict
                        ? 'text-rose-600'
                        : isGiven
                          ? 'text-teal-950'
                          : 'text-sky-700'
                    }
                  >
                    {value}
                  </span>
                ) : notes[i].size > 0 ? (
                  <span className="grid grid-cols-3 gap-0 p-0.5 text-[clamp(0.4rem,1.5vmin,0.65rem)] leading-none text-teal-700/70">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <span key={n} className="text-center">
                        {notes[i].has(n) ? n : ''}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            )
          })}
          </div>
        </GameBoardFrame>
      )}

      <div className="mt-5 grid grid-cols-5 gap-2 sm:gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => placeNumber(n)}
            disabled={paused || won}
            className="rounded-xl bg-teal-600 py-3 text-lg font-black text-white shadow hover:bg-teal-700 disabled:opacity-40 sm:py-4 sm:text-xl"
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={erase}
          disabled={paused || won}
          className="inline-flex items-center justify-center rounded-xl border border-[rgb(var(--color-border))] py-3 hover:bg-[rgb(var(--color-surface))] disabled:opacity-40 sm:py-4"
          aria-label="Sil"
        >
          <Eraser className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setNotesMode((v) => !v)}
          className={`rounded-lg px-3 py-2 text-xs font-bold ${
            notesMode
              ? 'bg-amber-500 text-white'
              : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
          }`}
        >
          Not {notesMode ? 'açık' : 'kapalı'}
        </button>
        <button
          type="button"
          onClick={useHint}
          disabled={hintsLeft <= 0 || won || paused}
          className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold disabled:opacity-40"
        >
          <Lightbulb className="h-3.5 w-3.5" />
          İpucu ({hintsLeft})
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-[rgb(var(--color-muted))]">
        Klavye: 1–9 yaz · oklarla gez · sil için Backspace
      </p>
    </GameShell>
  )
}
