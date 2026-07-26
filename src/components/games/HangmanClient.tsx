'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react'
import {
  CATEGORY_LABEL,
  MAX_WRONG,
  countWrong,
  isLost,
  isWon,
  pickPuzzle,
  revealMask,
  type HangmanCategory,
  type HangmanPuzzle,
} from '@/lib/games/hangman/engine'
import { TURKISH_LETTERS } from '@/lib/games/kelime/engine'
import { GameLevelBar } from '@/components/games/GameLevelBar'
import { useGameLevels } from '@/hooks/useGameLevels'
import { ROUTES } from '@/constants/routes'

const FIGURE = [
  '',
  ' O ',
  ' O \n | ',
  ' O \n/| ',
  ' O \n/|\\',
  ' O \n/|\\\n/  ',
  ' O \n/|\\\n/ \\',
]

export function HangmanClient() {
  const { level, unlocked, selectLevel, completeLevel } = useGameLevels('adam-asmaca')
  const [category, setCategory] = useState<HangmanCategory | 'hepsi'>('hepsi')
  const [puzzle, setPuzzle] = useState<HangmanPuzzle>(() => pickPuzzle('hepsi', 1))
  const [guessed, setGuessed] = useState<Set<string>>(() => new Set())
  const advancedRef = useRef(false)

  const restart = useCallback(
    (cat: HangmanCategory | 'hepsi' = category, lvl = level) => {
      setCategory(cat)
      setPuzzle(pickPuzzle(cat, lvl))
      setGuessed(new Set())
      advancedRef.current = false
    },
    [category, level]
  )

  useEffect(() => {
    restart(category, level)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when level changes
  }, [level])

  const wrong = countWrong(puzzle.word, guessed)
  const won = isWon(puzzle.word, guessed)
  const lost = isLost(wrong)
  const mask = revealMask(puzzle.word, guessed)
  const livesLeft = MAX_WRONG - wrong
  const figure = useMemo(() => FIGURE[Math.min(wrong, MAX_WRONG)] ?? FIGURE[MAX_WRONG], [wrong])

  useEffect(() => {
    if (!won || advancedRef.current) return
    advancedRef.current = true
    completeLevel()
  }, [won, completeLevel])

  const guess = (letter: string) => {
    if (won || lost || guessed.has(letter)) return
    setGuessed((prev) => new Set(prev).add(letter))
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

      <header className="mb-5">
        <h1 className="text-2xl font-black text-[rgb(var(--color-text))]">Adam Asmaca</h1>
        <p className="text-sm text-[rgb(var(--color-muted))]">
          Harf tahmin et · {livesLeft} can · seviye {level}/3
        </p>
      </header>

      <GameLevelBar
        current={level}
        unlocked={unlocked}
        onSelect={(lvl) => selectLevel(lvl)}
        hint="Kazanınca sonraki seviye açılır"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(['hepsi', 'haber', 'spor', 'sehir', 'genel'] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => restart(cat, level)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              category === cat
                ? 'bg-orange-600 text-white'
                : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
            }`}
          >
            {cat === 'hepsi' ? 'Hepsi' : CATEGORY_LABEL[cat]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => restart()}
          className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Yeni
        </button>
      </div>

      <div className="mb-4 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 text-center">
        <pre className="mx-auto mb-3 h-24 font-mono text-sm leading-tight text-[rgb(var(--color-text))]">
          {figure || ' '}
        </pre>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-600">
          {CATEGORY_LABEL[puzzle.category]} · {puzzle.hint}
        </p>
        <div className="flex flex-wrap justify-center gap-2 text-2xl font-black tracking-[0.35em] text-[rgb(var(--color-text))]">
          {mask.map((ch, i) => (
            <span key={i} className="min-w-[1.25rem]">
              {ch}
            </span>
          ))}
        </div>
      </div>

      {won && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 font-semibold text-emerald-700">
          <Trophy className="h-5 w-5" />
          Bildin: {puzzle.word}
          {level < 3 ? ' · Sonraki seviye açıldı!' : ' · Tüm seviyeler tamam'}
        </div>
      )}
      {lost && (
        <div className="mb-4 rounded-xl bg-rose-500/15 px-4 py-3 text-center font-semibold text-rose-700">
          Kaybettin — kelime: {puzzle.word}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-1.5">
        {TURKISH_LETTERS.map((letter) => {
          const used = guessed.has(letter)
          const hit = puzzle.word.includes(letter)
          return (
            <button
              key={letter}
              type="button"
              disabled={used || won || lost}
              onClick={() => guess(letter)}
              className={`min-w-[2rem] rounded-md px-2 py-2 text-sm font-bold disabled:opacity-40 ${
                used
                  ? hit
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-500 text-white'
                  : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'
              }`}
            >
              {letter}
            </button>
          )
        })}
      </div>
    </div>
  )
}
