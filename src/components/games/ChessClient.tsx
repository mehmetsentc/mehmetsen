'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Crown, RotateCcw, Users } from 'lucide-react'
import { chooseAiMove, CPU_COLOR } from '@/lib/games/chess/ai'
import {
  applyMove,
  colorLabel,
  createInitialState,
  getLegalMoves,
  moveKey,
  pieceSymbol,
  rankOf,
  type ChessState,
  type Color,
  type Move,
  type PieceType,
} from '@/lib/games/chess/engine'
import { GameBoardFrame, GameShell } from '@/components/games/GameShell'
import { useGameScores } from '@/hooks/useGameScores'

type PlayMode = 'local' | 'cpu'

const FILES = 'abcdefgh'

export function ChessClient() {
  const { submitScore } = useGameScores('satranc')
  const [mode, setMode] = useState<PlayMode>('cpu')
  const [state, setState] = useState<ChessState>(() => createInitialState())
  const [selected, setSelected] = useState<number | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: number
    to: number
  } | null>(null)
  const scoreSubmittedRef = useRef(false)

  const vsCpu = mode === 'cpu'
  const humanColor: Color = 'w'
  const isHumanTurn =
    !vsCpu || state.turn === humanColor

  const legalMoves = useMemo(() => getLegalMoves(state), [state])

  const targetsForSelection = useMemo(() => {
    if (selected === null) return new Map<string, Move>()
    const map = new Map<string, Move>()
    for (const m of legalMoves) {
      if (m.from === selected) map.set(moveKey(m), m)
    }
    return map
  }, [legalMoves, selected])

  const reset = () => {
    setState(createInitialState())
    setSelected(null)
    setPendingPromotion(null)
    scoreSubmittedRef.current = false
  }

  const setPlayMode = (next: PlayMode) => {
    setMode(next)
    reset()
  }

  const commitMove = useCallback((move: Move) => {
    setState((s) => {
      const next = applyMove(s, move)
      return next ?? s
    })
    setSelected(null)
    setPendingPromotion(null)
  }, [])

  useEffect(() => {
    if (!vsCpu || state.status !== 'active' || state.turn !== CPU_COLOR) return

    const id = window.setTimeout(() => {
      setState((current) => {
        if (current.status !== 'active' || current.turn !== CPU_COLOR) return current
        const move = chooseAiMove(current)
        if (!move) return current
        return applyMove(current, move) ?? current
      })
      setSelected(null)
    }, 450)

    return () => window.clearTimeout(id)
  }, [state, vsCpu])

  useEffect(() => {
    if (state.status !== 'checkmate' || !state.winner || scoreSubmittedRef.current) return
    if (vsCpu && state.winner !== humanColor) return
    scoreSubmittedRef.current = true
    void submitScore(1, { won: true })
  }, [state.status, state.winner, vsCpu, submitScore])

  const trySelect = (sqIndex: number) => {
    if (!isHumanTurn || state.status !== 'active') return
    const piece = state.squares[sqIndex]
    if (piece && piece.color === state.turn) {
      const hasMove = legalMoves.some((m) => m.from === sqIndex)
      if (hasMove) setSelected(sqIndex)
      return
    }
    if (selected !== null) tryMoveTo(sqIndex)
  }

  const tryMoveTo = (to: number) => {
    if (selected === null || !isHumanTurn) return
    const candidates = legalMoves.filter((m) => m.from === selected && m.to === to)
    if (candidates.length === 0) return

    const piece = state.squares[selected]
    const needsPromo =
      piece?.type === 'P' &&
      ((piece.color === 'w' && rankOf(to) === 0) || (piece.color === 'b' && rankOf(to) === 7))

    if (needsPromo && candidates.length > 1) {
      setPendingPromotion({ from: selected, to })
      return
    }

    commitMove(candidates[0])
  }

  const onSquareClick = (sqIndex: number) => {
    if (pendingPromotion) return
    if (selected !== null && targetsForSelection.has(moveKey({ from: selected, to: sqIndex }))) {
      tryMoveTo(sqIndex)
      return
    }
    trySelect(sqIndex)
  }

  const statusMessage = () => {
    if (state.status === 'checkmate') {
      const who = state.winner ? colorLabel(state.winner, vsCpu) : 'Oyuncu'
      return `${who} mat etti!`
    }
    if (state.status === 'stalemate') return 'Pat — berabere.'
    if (state.inCheck) return 'Şah!'
    if (!isHumanTurn && vsCpu) return 'Bilgisayar düşünüyor…'
    return 'Taşı seç, hedef kareye dokun'
  }

  return (
    <GameShell
      gameSlug="satranc"
      title="Satranç"
      subtitle={`Klasik kurallar · rok ve geçerken alma · ${vsCpu ? 'Beyaz sensin' : 'İki oyuncu'}`}
      stats={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[rgb(var(--color-border))] p-0.5">
            <button
              type="button"
              onClick={() => setPlayMode('cpu')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                vsCpu ? 'bg-emerald-700 text-white' : 'text-[rgb(var(--color-muted))]'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              Tek kişi
            </button>
            <button
              type="button"
              onClick={() => setPlayMode('local')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                !vsCpu ? 'bg-emerald-700 text-white' : 'text-[rgb(var(--color-muted))]'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              İki kişi
            </button>
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm font-medium hover:bg-[rgb(var(--color-surface))]"
          >
            <RotateCcw className="h-4 w-4" />
            Yeniden
          </button>
        </div>
      }
    >
      <div
        className={`mb-4 rounded-xl px-4 py-3 text-center text-sm font-semibold ${
          state.status === 'checkmate'
            ? 'bg-emerald-500/15 text-emerald-700'
            : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))]'
        }`}
      >
        {state.status === 'active' && (
          <p className="mb-1 text-xs font-medium text-[rgb(var(--color-muted))]">
            Sıra: {colorLabel(state.turn, vsCpu)}
          </p>
        )}
        {statusMessage()}
      </div>

      <GameBoardFrame
        cols={8}
        rows={8}
        className="relative overflow-hidden rounded-2xl border-2 border-stone-700 shadow-xl"
      >
        <div className="grid h-full w-full grid-cols-8 grid-rows-8">
          {Array.from({ length: 64 }, (_, displayIndex) => {
            const rank = 7 - Math.floor(displayIndex / 8)
            const file = displayIndex % 8
            const sqIndex = rank * 8 + file
            const light = (file + rank) % 2 === 0
            const piece = state.squares[sqIndex]
            const isSelected = selected === sqIndex
            const highlight = [...targetsForSelection.values()].some((m) => m.to === sqIndex)
            const lastMoveHighlight = false

            return (
              <button
                key={sqIndex}
                type="button"
                onClick={() => onSquareClick(sqIndex)}
                className={`relative flex items-center justify-center text-[clamp(1.25rem,5vmin,2.75rem)] ${
                  light ? 'bg-amber-100' : 'bg-emerald-800'
                } ${isSelected ? 'ring-2 ring-inset ring-sky-400' : ''} ${
                  highlight ? 'ring-2 ring-inset ring-lime-400' : ''
                } ${lastMoveHighlight ? 'bg-yellow-200/40' : ''}`}
              >
                {highlight && !piece && (
                  <span className="h-3 w-3 rounded-full bg-lime-500/70" />
                )}
                {piece && (
                  <span
                    className={`select-none drop-shadow-md ${
                      piece.color === 'w' ? 'text-stone-100' : 'text-stone-900'
                    }`}
                  >
                    {pieceSymbol(piece)}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {pendingPromotion && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 p-4 backdrop-blur-sm">
            <p className="flex items-center gap-2 text-sm font-bold text-white">
              <Crown className="h-4 w-4" />
              Terfi seç
            </p>
            <div className="flex gap-2">
              {(['Q', 'R', 'B', 'N'] as PieceType[]).map((promo) => (
                <button
                  key={promo}
                  type="button"
                  onClick={() =>
                    commitMove({
                      from: pendingPromotion.from,
                      to: pendingPromotion.to,
                      promotion: promo,
                    })
                  }
                  className="rounded-xl bg-white px-4 py-2 text-2xl shadow hover:bg-amber-50"
                >
                  {pieceSymbol({ color: state.turn, type: promo })}
                </button>
              ))}
            </div>
          </div>
        )}
      </GameBoardFrame>

      <div className="mt-3 flex justify-between px-1 text-[10px] font-medium text-[rgb(var(--color-muted))]">
        <span>a</span>
        <span>h</span>
      </div>
      <p className="mt-4 text-center text-xs text-[rgb(var(--color-muted))]">
        {FILES.split('').join(' · ')} · 8–1
      </p>
    </GameShell>
  )
}
