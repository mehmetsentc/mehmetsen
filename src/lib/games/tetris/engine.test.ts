import { describe, expect, it } from 'vitest'
import {
  collides,
  createInitialState,
  hardDrop,
  move,
  rotate,
  tick,
} from '@/lib/games/tetris/engine'

describe('tetris engine', () => {
  it('starts with an active piece and empty visible board', () => {
    const state = createInitialState()
    expect(state.active).not.toBeNull()
    expect(state.gameOver).toBe(false)
    expect(state.score).toBe(0)
  })

  it('moves piece left and right within bounds', () => {
    let state = createInitialState()
    const startX = state.active!.x
    state = move(state, -1)
    expect(state.active!.x).toBe(startX - 1)
    state = move(state, 1)
    expect(state.active!.x).toBe(startX)
  })

  it('locks piece on hard drop and spawns next', () => {
    let state = createInitialState()
    const first = state.active!.type
    state = hardDrop(state)
    expect(state.active).not.toBeNull()
    expect(state.board.some((row) => row.some((c) => c === first))).toBe(true)
  })

  it('rotation does not leave board when kicks work', () => {
    let state = createInitialState()
    state = rotate(state)
    expect(state.active).not.toBeNull()
    expect(collides(state.board, state.active!)).toBe(false)
  })

  it('tick drops piece by one when free', () => {
    let state = createInitialState()
    const y = state.active!.y
    state = tick(state)
    expect(state.active!.y).toBe(y + 1)
  })
})
