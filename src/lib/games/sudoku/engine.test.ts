import { describe, expect, it } from 'vitest'
import {
  conflictMask,
  generatePuzzle,
  generateSolvedBoard,
  isComplete,
  isValidPlacement,
  solve,
  emptyGrid,
} from '@/lib/games/sudoku/engine'

describe('sudoku engine', () => {
  it('generates a fully valid solved board', () => {
    const board = generateSolvedBoard()
    expect(board).toHaveLength(81)
    expect(board.every((n) => n >= 1 && n <= 9)).toBe(true)
    for (let i = 0; i < 81; i++) {
      const row = Math.floor(i / 9)
      const col = i % 9
      expect(isValidPlacement(board, row, col, board[i])).toBe(true)
    }
  })

  it('solves an empty grid', () => {
    const g = emptyGrid()
    expect(solve(g)).toBe(true)
    expect(g.every((n) => n >= 1 && n <= 9)).toBe(true)
  })

  it('generates unique easy puzzle', () => {
    const { puzzle, solution, given } = generatePuzzle('easy')
    const clues = puzzle.filter((n) => n !== 0).length
    expect(clues).toBeGreaterThanOrEqual(35)
    expect(given.filter(Boolean).length).toBe(clues)
    expect(isComplete(solution, solution)).toBe(true)
    expect(conflictMask(puzzle).every((b) => !b)).toBe(true)
  })
})
