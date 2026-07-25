export const SIZE = 4

export type Grid = number[][]

export function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => [...row])
}

function emptyCells(grid: Grid): [number, number][] {
  const out: [number, number][] = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r]![c] === 0) out.push([r, c])
    }
  }
  return out
}

export function spawnTile(grid: Grid): Grid {
  const cells = emptyCells(grid)
  if (cells.length === 0) return grid
  const [r, c] = cells[Math.floor(Math.random() * cells.length)]!
  const next = cloneGrid(grid)
  next[r]![c] = Math.random() < 0.9 ? 2 : 4
  return next
}

export function newGame(): Grid {
  return spawnTile(spawnTile(emptyGrid()))
}

function slideRow(row: number[]): { row: number[]; score: number } {
  const filtered = row.filter((n) => n !== 0)
  const out: number[] = []
  let score = 0
  let i = 0
  while (i < filtered.length) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const merged = filtered[i]! * 2
      out.push(merged)
      score += merged
      i += 2
    } else {
      out.push(filtered[i]!)
      i += 1
    }
  }
  while (out.length < SIZE) out.push(0)
  return { row: out, score }
}

export type Dir = 'left' | 'right' | 'up' | 'down'

export function move(grid: Grid, dir: Dir): { grid: Grid; score: number; moved: boolean } {
  let score = 0
  let next = cloneGrid(grid)

  const applyRows = (leftward: boolean) => {
    for (let r = 0; r < SIZE; r++) {
      const row = next[r]!
      const input = leftward ? [...row] : [...row].reverse()
      const { row: slid, score: s } = slideRow(input)
      score += s
      next[r] = leftward ? slid : slid.reverse()
    }
  }

  const transpose = () => {
    const t = emptyGrid()
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) t[c]![r] = next[r]![c]!
    }
    next = t
  }

  if (dir === 'left') applyRows(true)
  else if (dir === 'right') applyRows(false)
  else if (dir === 'up') {
    transpose()
    applyRows(true)
    transpose()
  } else {
    transpose()
    applyRows(false)
    transpose()
  }

  const moved = JSON.stringify(grid) !== JSON.stringify(next)
  return { grid: next, score, moved }
}

export function canMove(grid: Grid): boolean {
  if (emptyCells(grid).length > 0) return true
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r]![c]!
      if (c + 1 < SIZE && grid[r]![c + 1] === v) return true
      if (r + 1 < SIZE && grid[r + 1]![c] === v) return true
    }
  }
  return false
}

export function maxTile(grid: Grid): number {
  let m = 0
  for (const row of grid) for (const v of row) if (v > m) m = v
  return m
}
