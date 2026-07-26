'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react'
import {
  MAX_GUESSES,
  TURKISH_LETTERS,
  WORD_LENGTH,
  isValidGuess,
  normalizeWord,
  pickDailyAnswer,
  pickRandomAnswer,
  scoreGuess,
  type LetterState,
} from '@/lib/games/kelime/engine'
import { GameLevelBar } from '@/components/games/GameLevelBar'
import { useGameLevels } from '@/hooks/useGameLevels'
import { ROUTES } from '@/constants/routes'

const STATE_CLASS: Record<LetterState, string> = {
  empty: 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]',
  correct: 'border-emerald-600 bg-emerald-600 text-white',
  present: 'border-amber-500 bg-amber-500 text-white',
  absent: 'border-zinc-500 bg-zinc-500 text-white',
}

type Row = { guess: string; states: LetterState[] | null }

export function KelimeClient() {
  const { level, unlocked, selectLevel, completeLevel } = useGameLevels('kelime')
  const maxGuesses = level === 1 ? 8 : level === 2 ? 6 : 5
  const [answer, setAnswer] = useState('')
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: MAX_GUESSES }, () => ({ guess: '', states: null }))
  )
  const [rowIndex, setRowIndex] = useState(0)
  const [current, setCurrent] = useState('')
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing')
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'gunluk' | 'rastgele'>('gunluk')
  const advancedRef = useRef(false)

  const start = useCallback((m: 'gunluk' | 'rastgele') => {
    const next = m === 'gunluk' ? pickDailyAnswer() : pickRandomAnswer()
    setAnswer(next)
    setRows(Array.from({ length: maxGuesses }, () => ({ guess: '', states: null })))
    setRowIndex(0)
    setCurrent('')
    setStatus('playing')
    setMessage('')
    setMode(m)
    advancedRef.current = false
  }, [maxGuesses])

  useEffect(() => {
    start('rastgele')
  }, [start, level])

  useEffect(() => {
    if (status !== 'won' || advancedRef.current) return
    advancedRef.current = true
    completeLevel()
  }, [status, completeLevel])

  const keyStates = useMemo(() => {
    const map: Partial<Record<string, LetterState>> = {}
    for (const row of rows) {
      if (!row.states) continue
      row.guess.split('').forEach((ch, i) => {
        const s = row.states![i]!
        const prev = map[ch]
        if (prev === 'correct') return
        if (s === 'correct' || prev !== 'present') map[ch] = s
      })
    }
    return map
  }, [rows])

  const submit = useCallback(() => {
    if (status !== 'playing') return
    const guess = normalizeWord(current)
    if (guess.length !== WORD_LENGTH) {
      setMessage('5 harf girin')
      return
    }
    if (!isValidGuess(guess)) {
      setMessage('Kelime listesinde yok')
      return
    }
    const states = scoreGuess(guess, answer)
    setRows((prev) => {
      const next = [...prev]
      next[rowIndex] = { guess, states }
      return next
    })
    setCurrent('')
    setMessage('')

    if (states.every((s) => s === 'correct')) {
      setStatus('won')
      return
    }
    if (rowIndex + 1 >= maxGuesses) {
      setStatus('lost')
      return
    }
    setRowIndex((i) => i + 1)
  }, [answer, current, rowIndex, status, maxGuesses])

  const onKey = useCallback(
    (key: string) => {
      if (status !== 'playing') return
      if (key === 'ENTER') {
        submit()
        return
      }
      if (key === 'BACK') {
        setCurrent((c) => c.slice(0, -1))
        setMessage('')
        return
      }
      if (current.length >= WORD_LENGTH) return
      if (!TURKISH_LETTERS.includes(key as (typeof TURKISH_LETTERS)[number])) return
      setCurrent((c) => c + key)
      setMessage('')
    },
    [current.length, status, submit]
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onKey('ENTER')
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        onKey('BACK')
        return
      }
      if (e.key.length === 1) {
        const ch = e.key.toLocaleUpperCase('tr-TR')
        if (TURKISH_LETTERS.includes(ch as (typeof TURKISH_LETTERS)[number])) {
          e.preventDefault()
          onKey(ch)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onKey])

  return (
    <div className="mx-auto max-w-md px-4 py-6 pb-20">
      <Link
        href={ROUTES.GAMES}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Tüm oyunlar
      </Link>

      <header className="mb-5">
        <h1 className="text-2xl font-black text-[rgb(var(--color-text))]">Kelime Günü</h1>
        <p className="text-sm text-[rgb(var(--color-muted))]">
          5 harfli Türkçe · seviye {level}/3 · {maxGuesses} deneme
        </p>
      </header>

      <GameLevelBar
        current={level}
        unlocked={unlocked}
        onSelect={selectLevel}
        hint="Kazanınca sonraki seviye açılır"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => start('gunluk')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
            mode === 'gunluk'
              ? 'bg-rose-600 text-white'
              : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
          }`}
        >
          Günlük
        </button>
        <button
          type="button"
          onClick={() => start('rastgele')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
            mode === 'rastgele'
              ? 'bg-rose-600 text-white'
              : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
          }`}
        >
          Rastgele
        </button>
        <button
          type="button"
          onClick={() => start(mode)}
          className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Yenile
        </button>
      </div>

      {status === 'won' && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 font-semibold text-emerald-700">
          <Trophy className="h-5 w-5" />
          Bildin! Kelime: {answer}
        </div>
      )}
      {status === 'lost' && (
        <div className="mb-4 rounded-xl bg-rose-500/15 px-4 py-3 text-center font-semibold text-rose-700">
          Bitti — kelime: {answer}
        </div>
      )}
      {message && (
        <p className="mb-3 text-center text-sm font-medium text-amber-600">{message}</p>
      )}

      <div className="mb-6 grid gap-1.5">
        {rows.map((row, ri) => {
          const letters =
            ri === rowIndex && status === 'playing'
              ? current.padEnd(WORD_LENGTH).slice(0, WORD_LENGTH).split('')
              : (row.guess || '').padEnd(WORD_LENGTH).slice(0, WORD_LENGTH).split('')
          return (
            <div key={ri} className="grid grid-cols-5 gap-1.5">
              {letters.map((ch, ci) => {
                const state = row.states?.[ci] ?? 'empty'
                const display = ch === ' ' ? '' : ch
                return (
                  <div
                    key={ci}
                    className={`flex aspect-square items-center justify-center rounded-md border-2 text-lg font-black uppercase ${STATE_CLASS[state]}`}
                  >
                    {display}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="space-y-1.5">
        {[
          TURKISH_LETTERS.slice(0, 10),
          TURKISH_LETTERS.slice(10, 20),
          TURKISH_LETTERS.slice(20),
        ].map((row, i) => (
          <div key={i} className="flex flex-wrap justify-center gap-1">
            {i === 2 && (
              <button
                type="button"
                onClick={() => onKey('ENTER')}
                className="rounded-md bg-[rgb(var(--color-text))] px-2 py-2 text-[10px] font-bold text-[rgb(var(--color-bg))]"
              >
                GİR
              </button>
            )}
            {row.map((letter) => {
              const st = keyStates[letter] ?? 'empty'
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => onKey(letter)}
                  className={`min-w-[1.7rem] rounded-md px-1.5 py-2 text-xs font-bold ${STATE_CLASS[st]}`}
                >
                  {letter}
                </button>
              )
            })}
            {i === 2 && (
              <button
                type="button"
                onClick={() => onKey('BACK')}
                className="rounded-md bg-[rgb(var(--color-surface))] px-2 py-2 text-[10px] font-bold"
              >
                ⌫
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
