export type SudokuDifficulty = 'easy' | 'medium' | 'hard'

export type SudokuGrid = number[] // length 81, 0 = empty

export const SUDOKU_DIFFICULTIES: {
  id: SudokuDifficulty
  label: string
  clues: number
  hintLimit: number
}[] = [
  { id: 'easy', label: 'Kolay', clues: 40, hintLimit: 5 },
  { id: 'medium', label: 'Orta', clues: 32, hintLimit: 3 },
  { id: 'hard', label: 'Zor', clues: 26, hintLimit: 2 },
]

export function emptyGrid(): SudokuGrid {
  return Array.from({ length: 81 }, () => 0)
}

export function cloneGrid(grid: SudokuGrid): SudokuGrid {
  return grid.slice()
}

export function idx(row: number, col: number): number {
  return row * 9 + col
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function isValidPlacement(grid: SudokuGrid, row: number, col: number, num: number): boolean {
  for (let c = 0; c < 9; c++) {
    if (c !== col && grid[idx(row, c)] === num) return false
  }
  for (let r = 0; r < 9; r++) {
    if (r !== row && grid[idx(r, col)] === num) return false
  }
  const br = Math.floor(row / 3) * 3
  const bc = Math.floor(col / 3) * 3
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if ((r !== row || c !== col) && grid[idx(r, c)] === num) return false
    }
  }
  return true
}

function findEmpty(grid: SudokuGrid): number | null {
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0) return i
  }
  return null
}

/** Backtracking fill; returns true when complete. */
export function solve(grid: SudokuGrid, randomized = false): boolean {
  const empty = findEmpty(grid)
  if (empty === null) return true
  const row = Math.floor(empty / 9)
  const col = empty % 9
  const nums = randomized ? shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]) : [1, 2, 3, 4, 5, 6, 7, 8, 9]
  for (const n of nums) {
    if (isValidPlacement(grid, row, col, n)) {
      grid[empty] = n
      if (solve(grid, randomized)) return true
      grid[empty] = 0
    }
  }
  return false
}

function countSolutions(grid: SudokuGrid, limit = 2): number {
  const empty = findEmpty(grid)
  if (empty === null) return 1
  const row = Math.floor(empty / 9)
  const col = empty % 9
  let count = 0
  for (let n = 1; n <= 9; n++) {
    if (!isValidPlacement(grid, row, col, n)) continue
    grid[empty] = n
    count += countSolutions(grid, limit)
    grid[empty] = 0
    if (count >= limit) return count
  }
  return count
}

export function generateSolvedBoard(): SudokuGrid {
  const grid = emptyGrid()
  solve(grid, true)
  return grid
}

export type SudokuPuzzle = {
  puzzle: SudokuGrid
  solution: SudokuGrid
  difficulty: SudokuDifficulty
  given: boolean[]
}

export function generatePuzzle(difficulty: SudokuDifficulty): SudokuPuzzle {
  const config = SUDOKU_DIFFICULTIES.find((d) => d.id === difficulty)!
  const solution = generateSolvedBoard()
  const puzzle = cloneGrid(solution)
  const cells = shuffle(Array.from({ length: 81 }, (_, i) => i))
  let removed = 0
  const targetRemove = 81 - config.clues

  for (const cell of cells) {
    if (removed >= targetRemove) break
    const backup = puzzle[cell]
    puzzle[cell] = 0
    const trial = cloneGrid(puzzle)
    if (countSolutions(trial, 2) !== 1) {
      puzzle[cell] = backup
      continue
    }
    removed++
  }

  const given = puzzle.map((v) => v !== 0)
  return { puzzle, solution, difficulty, given }
}

export function conflictMask(grid: SudokuGrid): boolean[] {
  const bad = Array.from({ length: 81 }, () => false)
  for (let i = 0; i < 81; i++) {
    const v = grid[i]
    if (v === 0) continue
    const row = Math.floor(i / 9)
    const col = i % 9
    if (!isValidPlacement(grid, row, col, v)) bad[i] = true
  }
  return bad
}

export function isComplete(grid: SudokuGrid, solution: SudokuGrid): boolean {
  for (let i = 0; i < 81; i++) {
    if (grid[i] !== solution[i]) return false
  }
  return true
}

export function findHintCell(grid: SudokuGrid, solution: SudokuGrid, given: boolean[]): number | null {
  const empties: number[] = []
  for (let i = 0; i < 81; i++) {
    if (!given[i] && grid[i] !== solution[i]) empties.push(i)
  }
  if (empties.length === 0) return null
  return empties[Math.floor(Math.random() * empties.length)]
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
