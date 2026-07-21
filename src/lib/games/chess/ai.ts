import {
  applyMove,
  getLegalMoves,
  type ChessState,
  type Color,
  type Move,
  type PieceType,
} from '@/lib/games/chess/engine'

export const CPU_COLOR: Color = 'b'

const PIECE_VALUE: Record<PieceType, number> = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 20000,
}

function evaluate(state: ChessState): number {
  let score = 0
  for (const p of state.squares) {
    if (!p) continue
    const v = PIECE_VALUE[p.type]
    score += p.color === CPU_COLOR ? v : -v
  }
  if (state.status === 'checkmate' && state.winner === CPU_COLOR) score += 50000
  if (state.status === 'checkmate' && state.winner !== CPU_COLOR) score -= 50000
  if (state.inCheck && state.turn === CPU_COLOR) score -= 40
  return score
}

function minimax(state: ChessState, depth: number, maximizing: boolean): number {
  if (depth === 0 || state.status !== 'active') return evaluate(state)

  const moves = getLegalMoves(state)
  if (moves.length === 0) return evaluate(state)

  if (maximizing) {
    let best = -Infinity
    for (const move of moves) {
      const next = applyMove(state, move)
      if (!next) continue
      best = Math.max(best, minimax(next, depth - 1, false))
    }
    return best
  }

  let best = Infinity
  for (const move of moves) {
    const next = applyMove(state, move)
    if (!next) continue
    best = Math.min(best, minimax(next, depth - 1, true))
  }
  return best
}

/** Derinlik 2 minimax — siyah (CPU) oynar. */
export function chooseAiMove(state: ChessState, depth = 2): Move | null {
  if (state.turn !== CPU_COLOR || state.status !== 'active') return null
  const moves = getLegalMoves(state)
  if (moves.length === 0) return null

  let bestMove = moves[0]
  let bestScore = -Infinity

  for (const move of moves) {
    const next = applyMove(state, move)
    if (!next) continue
    const score = minimax(next, depth - 1, false)
    const jitter = Math.random() * 6
    if (score + jitter > bestScore) {
      bestScore = score + jitter
      bestMove = move
    }
  }

  return bestMove
}
