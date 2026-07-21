import { describe, expect, it } from 'vitest'
import {
  applyMove,
  createInitialState,
  getLegalMoves,
  sq,
} from '@/lib/games/chess/engine'

describe('chess engine', () => {
  it('starts with 20 legal moves for white', () => {
    const state = createInitialState()
    expect(getLegalMoves(state)).toHaveLength(20)
  })

  it('allows knight to move', () => {
    const state = createInitialState()
    const move = { from: sq(1, 7), to: sq(2, 5) }
    const next = applyMove(state, move)
    expect(next).not.toBeNull()
    expect(next!.turn).toBe('b')
    expect(next!.squares[sq(2, 5)]?.type).toBe('N')
  })

  it('recognizes checkmate from FEN', () => {
    const state = createInitialState(
      'rnbqkbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 3'
    )
    expect(state.status).toBe('checkmate')
    expect(state.winner).toBe('b')
  })
})
