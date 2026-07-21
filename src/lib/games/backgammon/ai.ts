import {
  applyMove,
  getLegalMoves,
  type BackgammonState,
  type Move,
  type PlayerId,
} from '@/lib/games/backgammon/engine'

const AI_PLAYER: PlayerId = 2

function moveScore(state: BackgammonState, move: Move): number {
  const trial = applyMove(state, move)
  if (!trial) return -9999

  let score = 0

  if (move.to === 'off') score += 120
  if (move.from === 'bar') score += 40

  if (typeof move.from === 'number' && typeof move.to === 'number') {
    const dist = AI_PLAYER === 2 ? move.to - move.from : move.from - move.to
    score += dist * 3
    const target = state.points[move.to]
    if (target !== 0 && Math.sign(target) !== -1) score += 55
  }

  if (trial.off.p2 > state.off.p2) score += 80
  if (trial.bar.p1 > state.bar.p1) score += 25

  score += Math.random() * 4
  return score
}

/** Basit sezgisel: dışarı alma, vurma ve ilerlemeyi tercih eder. */
export function chooseAiMove(state: BackgammonState): Move | null {
  if (state.turn !== AI_PLAYER) return null
  const moves = getLegalMoves(state)
  if (moves.length === 0) return null

  let best = moves[0]
  let bestScore = moveScore(state, best)
  for (let i = 1; i < moves.length; i++) {
    const s = moveScore(state, moves[i])
    if (s > bestScore) {
      bestScore = s
      best = moves[i]
    }
  }
  return best
}

export const CPU_PLAYER_ID = AI_PLAYER
