export type MinesDifficulty = 'easy' | 'medium' | 'hard'

export type MinesConfig = {
  id: MinesDifficulty
  label: string
  rows: number
  cols: number
  mines: number
}

export const MINES_DIFFICULTIES: MinesConfig[] = [
  { id: 'easy', label: 'Kolay', rows: 8, cols: 8, mines: 10 },
  { id: 'medium', label: 'Orta', rows: 10, cols: 10, mines: 20 },
  { id: 'hard', label: 'Zor', rows: 12, cols: 12, mines: 35 },
]

export type Cell = {
  mine: boolean
  revealed: boolean
  flagged: boolean
  adjacent: number
}

export type Board = Cell[][]

function inBounds(board: Board, r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < board.length && c < board[0]!.length
}

function neighbors(r: number, c: number): [number, number][] {
  const out: [number, number][] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      out.push([r + dr, c + dc])
    }
  }
  return out
}

export function createEmptyBoard(rows: number, cols: number): Board {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    }))
  )
}

export function placeMines(board: Board, mines: number, safeR: number, safeC: number): Board {
  const rows = board.length
  const cols = board[0]!.length
  const next = board.map((row) => row.map((cell) => ({ ...cell })))
  let placed = 0
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows)
    const c = Math.floor(Math.random() * cols)
    if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue
    if (next[r]![c]!.mine) continue
    next[r]![c]!.mine = true
    placed += 1
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (next[r]![c]!.mine) {
        next[r]![c]!.adjacent = 0
        continue
      }
      let n = 0
      for (const [nr, nc] of neighbors(r, c)) {
        if (inBounds(next, nr, nc) && next[nr]![nc]!.mine) n += 1
      }
      next[r]![c]!.adjacent = n
    }
  }
  return next
}

export function revealCell(board: Board, r: number, c: number): Board {
  if (!inBounds(board, r, c)) return board
  const cell = board[r]![c]!
  if (cell.revealed || cell.flagged) return board

  const next = board.map((row) => row.map((x) => ({ ...x })))
  const stack: [number, number][] = [[r, c]]

  while (stack.length) {
    const [cr, cc] = stack.pop()!
    const cur = next[cr]![cc]!
    if (cur.revealed || cur.flagged) continue
    cur.revealed = true
    if (cur.mine) continue
    if (cur.adjacent === 0) {
      for (const [nr, nc] of neighbors(cr, cc)) {
        if (inBounds(next, nr, nc) && !next[nr]![nc]!.revealed && !next[nr]![nc]!.flagged) {
          stack.push([nr, nc])
        }
      }
    }
  }
  return next
}

export function toggleFlag(board: Board, r: number, c: number): Board {
  if (!inBounds(board, r, c)) return board
  const cell = board[r]![c]!
  if (cell.revealed) return board
  const next = board.map((row) => row.map((x) => ({ ...x })))
  next[r]![c]!.flagged = !cell.flagged
  return next
}

export function isWin(board: Board): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (!cell.mine && !cell.revealed) return false
    }
  }
  return true
}

export function countFlags(board: Board): number {
  let n = 0
  for (const row of board) for (const cell of row) if (cell.flagged) n += 1
  return n
}

export function revealAllMines(board: Board): Board {
  return board.map((row) =>
    row.map((cell) => (cell.mine ? { ...cell, revealed: true } : { ...cell }))
  )
}
