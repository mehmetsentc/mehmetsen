'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Dices, Users } from 'lucide-react'
import { chooseAiMove, CPU_PLAYER_ID } from '@/lib/games/backgammon/ai'
import {
  applyMove,
  canRoll,
  createInitialState,
  getLegalMoves,
  playerLabel,
  rollDice,
  type BackgammonState,
  type Move,
  type MoveFrom,
} from '@/lib/games/backgammon/engine'
import { GameShell } from '@/components/games/GameShell'
import { useGameScores } from '@/hooks/useGameScores'

type Selection = MoveFrom | null
type PlayMode = 'local' | 'cpu'

function pointLabel(index: number): string {
  return String(index + 1)
}

export function BackgammonClient() {
  const { submitScore } = useGameScores('tavla')
  const [mode, setMode] = useState<PlayMode>('cpu')
  const [state, setState] = useState<BackgammonState>(() => createInitialState())
  const [selected, setSelected] = useState<Selection>(null)
  const scoreSubmittedRef = useRef(false)

  const vsCpu = mode === 'cpu'
  const isHumanTurn = !vsCpu || state.turn === 1

  const legalMoves = useMemo(() => getLegalMoves(state), [state])

  const targetsForSelection = useMemo(() => {
    if (selected === null) return new Set<string>()
    const set = new Set<string>()
    for (const m of legalMoves) {
      if (m.from === selected) set.add(String(m.to))
    }
    if (selected === 'bar') {
      for (const m of legalMoves) {
        if (m.from === 'bar') set.add(String(m.to))
      }
    }
    return set
  }, [legalMoves, selected])

  const reset = () => {
    setState(createInitialState())
    setSelected(null)
    scoreSubmittedRef.current = false
  }

  const setPlayMode = (next: PlayMode) => {
    setMode(next)
    reset()
  }

  useEffect(() => {
    if (!vsCpu || state.winner || state.turn !== CPU_PLAYER_ID) return

    const id = window.setTimeout(() => {
      setState((current) => {
        if (current.winner || current.turn !== CPU_PLAYER_ID) return current
        if (canRoll(current)) return rollDice(current)
        const move = chooseAiMove(current)
        if (!move) return current
        return applyMove(current, move) ?? current
      })
      setSelected(null)
    }, 550)

    return () => window.clearTimeout(id)
  }, [state, vsCpu])

  useEffect(() => {
    if (!state.winner || scoreSubmittedRef.current) return
    if (vsCpu && state.winner !== 1) return
    scoreSubmittedRef.current = true
    void submitScore(1, { won: true })
  }, [state.winner, vsCpu, submitScore])

  const onRoll = () => {
    if (!isHumanTurn) return
    setState((s) => rollDice(s))
    setSelected(null)
  }

  const trySelect = useCallback(
    (from: MoveFrom) => {
      if (!isHumanTurn || state.winner || state.dice.length === 0) return
      const hasFrom = legalMoves.some((m) => m.from === from)
      if (hasFrom) setSelected(from)
    },
    [isHumanTurn, legalMoves, state.dice.length, state.winner]
  )

  const tryMoveTo = (to: number | 'off') => {
    if (!isHumanTurn || selected === null) return
    const move = legalMoves.find((m) => m.from === selected && m.to === to)
    if (!move) return
    const next = applyMove(state, move)
    if (next) {
      setState(next)
      setSelected(null)
    }
  }

  const onPointClick = (index: number) => {
    if (!isHumanTurn) return
    const player = state.turn
    const count =
      player === 1
        ? Math.max(0, state.points[index])
        : Math.max(0, -state.points[index])

    if (selected !== null) {
      tryMoveTo(index)
      return
    }
    if (count > 0) trySelect(index)
  }

  const diceDisplay = state.dice.map((d, i) => (
    <span
      key={`${d}-${i}`}
      className={`flex h-10 w-10 items-center justify-center rounded-lg font-bold ${
        state.usedDice[i]
          ? 'bg-black/20 text-white/40 line-through'
          : 'bg-white text-violet-900 shadow'
      }`}
    >
      {d}
    </span>
  ))

  return (
    <GameShell
      gameSlug="tavla"
      title="Tavla"
      onRestart={reset}
      subtitle={
        vsCpu ? 'Bilgisayara karşı veya iki oyuncu · Beta' : 'Aynı cihazda iki oyuncu · Beta'
      }
      stats={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[rgb(var(--color-border))] p-0.5">
            <button
              type="button"
              onClick={() => setPlayMode('cpu')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                vsCpu ? 'bg-violet-600 text-white' : 'text-[rgb(var(--color-muted))]'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              Tek kişi
            </button>
            <button
              type="button"
              onClick={() => setPlayMode('local')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                !vsCpu ? 'bg-violet-600 text-white' : 'text-[rgb(var(--color-muted))]'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              İki kişi
            </button>
          </div>
        </div>
      }
    >
      {state.winner ? (
        <div className="mb-4 rounded-xl bg-emerald-500/15 px-4 py-3 text-center font-semibold text-emerald-700">
          {playerLabel(state.winner, vsCpu)} kazandı!
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[rgb(var(--color-surface))] px-4 py-3">
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
            Sıra: {playerLabel(state.turn, vsCpu)}
          </p>
          <div className="flex items-center gap-2">{diceDisplay}</div>
          {canRoll(state) && isHumanTurn ? (
            <button
              type="button"
              onClick={onRoll}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700"
            >
              <Dices className="h-4 w-4" />
              Zar at
            </button>
          ) : !isHumanTurn ? (
            <p className="text-xs text-[rgb(var(--color-muted))]">Bilgisayar oynuyor…</p>
          ) : (
            <p className="text-xs text-[rgb(var(--color-muted))]">Taşına tıkla, hedefe tıkla</p>
          )}
        </div>
      )}

      <div className="w-full overflow-x-auto rounded-2xl border border-amber-900/30 bg-gradient-to-b from-amber-800 to-amber-950 p-2 shadow-inner sm:p-3">
        <div className="flex w-full min-w-0 gap-0.5 sm:gap-1">
          {/* Üst yarı — p2 yönü */}
          <div className="grid flex-1 grid-cols-12 gap-0.5">
            {Array.from({ length: 12 }, (_, i) => 12 + i).map((idx) => (
              <BoardPoint
                key={`t-${idx}`}
                index={idx}
                state={state}
                flip
                selected={selected === idx}
                highlight={targetsForSelection.has(String(idx))}
                onClick={() => onPointClick(idx)}
              />
            ))}
          </div>
          <BarColumn
            state={state}
            selected={selected === 'bar'}
            onBarClick={() => {
              if (!isHumanTurn) return
              if (selected === 'bar') return
              if (state.turn === 1 && state.bar.p1 > 0) trySelect('bar')
              if (state.turn === 2 && state.bar.p2 > 0) trySelect('bar')
            }}
          />
          <div className="grid flex-1 grid-cols-12 gap-0.5">
            {Array.from({ length: 12 }, (_, i) => 11 - i).map((idx) => (
              <BoardPoint
                key={`t2-${idx}`}
                index={idx}
                state={state}
                flip
                selected={selected === idx}
                highlight={targetsForSelection.has(String(idx))}
                onClick={() => onPointClick(idx)}
              />
            ))}
          </div>
        </div>

        <div className="my-2 flex justify-center gap-4 text-xs text-amber-100/80">
          <span>Dışarı P1: {state.off.p1}</span>
          {targetsForSelection.has('off') && selected !== null && (
            <button
              type="button"
              onClick={() => tryMoveTo('off')}
              className="rounded bg-white/20 px-2 py-1 font-bold text-white"
            >
              Taşı dışarı al
            </button>
          )}
          <span>Dışarı P2: {state.off.p2}</span>
        </div>

        <div className="flex w-full min-w-0 gap-0.5 sm:gap-1">
          <div className="grid flex-1 grid-cols-12 gap-0.5">
            {Array.from({ length: 12 }, (_, i) => i).map((idx) => (
              <BoardPoint
                key={`b-${idx}`}
                index={idx}
                state={state}
                selected={selected === idx}
                highlight={targetsForSelection.has(String(idx))}
                onClick={() => onPointClick(idx)}
              />
            ))}
          </div>
          <div className="w-8 shrink-0 sm:w-10" />
          <div className="grid flex-1 grid-cols-12 gap-0.5">
            {Array.from({ length: 12 }, (_, i) => 23 - i).map((idx) => (
              <BoardPoint
                key={`b2-${idx}`}
                index={idx}
                state={state}
                selected={selected === idx}
                highlight={targetsForSelection.has(String(idx))}
                onClick={() => onPointClick(idx)}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-[rgb(var(--color-muted))]">
        Nokta {pointLabel(0)}–{pointLabel(23)} · Klasik tavla kuralları (MVP)
      </p>
    </GameShell>
  )
}

function BarColumn({
  state,
  selected,
  onBarClick,
}: {
  state: BackgammonState
  selected: boolean
  onBarClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onBarClick}
      className={`flex w-8 shrink-0 flex-col items-center justify-center gap-1 rounded border border-amber-950/50 bg-amber-900/40 text-[10px] text-amber-100 sm:w-10 ${
        selected ? 'ring-2 ring-white' : ''
      }`}
    >
      <span>Bar</span>
      <span>{state.bar.p1 > 0 ? `⬜${state.bar.p1}` : ''}</span>
      <span>{state.bar.p2 > 0 ? `⬛${state.bar.p2}` : ''}</span>
    </button>
  )
}

function BoardPoint({
  index,
  state,
  flip,
  selected,
  highlight,
  onClick,
}: {
  index: number
  state: BackgammonState
  flip?: boolean
  selected: boolean
  highlight: boolean
  onClick: () => void
}) {
  const v = state.points[index]
  const p1 = v > 0 ? v : 0
  const p2 = v < 0 ? -v : 0
  const count = p1 || p2
  const isP1 = p1 > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex min-h-[4.5rem] flex-1 flex-col items-center border border-amber-950/20 sm:min-h-[6rem] ${
        flip ? 'justify-start' : 'justify-end'
      } ${
        index % 2 === 0 ? 'bg-amber-700/40' : 'bg-amber-800/50'
      } ${selected ? 'ring-2 ring-white' : ''} ${highlight ? 'ring-2 ring-emerald-400' : ''}`}
    >
      <span className="absolute left-0.5 top-0.5 text-[8px] text-amber-200/60">{index + 1}</span>
      <div className={`flex flex-col gap-0.5 p-1 ${flip ? 'flex-col-reverse' : ''}`}>
        {Array.from({ length: Math.min(count, 5) }, (_, i) => (
          <span key={i} className="text-[clamp(0.75rem,2.5vw,1.125rem)] leading-none">
            {isP1 ? '⬜' : '⬛'}
          </span>
        ))}
        {count > 5 && (
          <span className="text-[10px] font-bold text-white">+{count - 5}</span>
        )}
      </div>
    </button>
  )
}
