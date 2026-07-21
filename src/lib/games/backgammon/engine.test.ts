import { describe, expect, it } from 'vitest'
import {
  applyMove,
  createInitialState,
  getLegalMoves,
  rollDice,
} from '@/lib/games/backgammon/engine'

describe('backgammon engine', () => {
  it('starts with standard layout', () => {
    const s = createInitialState()
    expect(s.points[0]).toBe(2)
    expect(s.points[23]).toBe(-2)
    expect(s.winner).toBeNull()
  })

  it('allows rolling dice once per turn', () => {
    const rolled = rollDice(createInitialState())
    expect(rolled.dice.length).toBeGreaterThan(0)
    expect(rollDice(rolled).dice).toEqual(rolled.dice)
  })

  it('applies a legal move when dice are set', () => {
    let s = createInitialState()
    s = { ...s, dice: [3, 4], usedDice: [false, false], turn: 1 }
    const moves = getLegalMoves(s)
    expect(moves.length).toBeGreaterThan(0)
    const next = applyMove(s, moves[0])
    expect(next).not.toBeNull()
  })
})
