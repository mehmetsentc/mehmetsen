export type TetrisDifficulty = 'easy' | 'medium' | 'hard'

export type CellColor =
  | 'I'
  | 'O'
  | 'T'
  | 'S'
  | 'Z'
  | 'J'
  | 'L'
  | null

export type PieceType = Exclude<CellColor, null>

export type Point = { x: number; y: number }

export type ActivePiece = {
  type: PieceType
  rotation: number
  x: number
  y: number
}

export type TetrisState = {
  board: CellColor[][]
  active: ActivePiece | null
  next: PieceType
  hold: PieceType | null
  canHold: boolean
  score: number
  lines: number
  level: number
  gameOver: boolean
  bag: PieceType[]
}

export const COLS = 10
export const ROWS = 20
export const HIDDEN_ROWS = 2
export const TOTAL_ROWS = ROWS + HIDDEN_ROWS

/** Kick-free rotations — classic shapes (4 rotations each). */
export const SHAPES: Record<PieceType, Point[][]> = {
  I: [
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ],
    [
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
    ],
    [
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ],
  ],
  O: [
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
  ],
  T: [
    [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ],
    [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ],
  ],
  S: [
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ],
    [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ],
  ],
  Z: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
    [
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ],
    [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
    ],
  ],
  J: [
    [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
    ],
  ],
  L: [
    [
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ],
  ],
}

export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#22d3ee',
  O: '#facc15',
  T: '#c084fc',
  S: '#4ade80',
  Z: '#f87171',
  J: '#60a5fa',
  L: '#fb923c',
}

export const TETRIS_DIFFICULTIES: {
  id: TetrisDifficulty
  label: string
  description: string
  baseTickMs: number
  softDropMs: number
  accent: string
}[] = [
  {
    id: 'easy',
    label: 'Kolay',
    description: 'Yavaş düşüş — öğrenmek için',
    baseTickMs: 900,
    softDropMs: 55,
    accent: 'from-cyan-400 to-blue-500',
  },
  {
    id: 'medium',
    label: 'Orta',
    description: 'Klasik arcade temposu',
    baseTickMs: 620,
    softDropMs: 40,
    accent: 'from-violet-400 to-fuchsia-500',
  },
  {
    id: 'hard',
    label: 'Zor',
    description: 'Hızlı düşüş — refleks modu',
    baseTickMs: 380,
    softDropMs: 28,
    accent: 'from-rose-500 to-orange-400',
  },
]

const ALL_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

function shuffleBag(): PieceType[] {
  const bag = ALL_TYPES.slice()
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

function emptyBoard(): CellColor[][] {
  return Array.from({ length: TOTAL_ROWS }, () => Array.from({ length: COLS }, () => null))
}

function cellsOf(piece: ActivePiece): Point[] {
  return SHAPES[piece.type][piece.rotation].map((p) => ({
    x: p.x + piece.x,
    y: p.y + piece.y,
  }))
}

export function collides(board: CellColor[][], piece: ActivePiece): boolean {
  for (const c of cellsOf(piece)) {
    if (c.x < 0 || c.x >= COLS || c.y >= TOTAL_ROWS) return true
    if (c.y >= 0 && board[c.y][c.x]) return true
  }
  return false
}

function spawnPiece(type: PieceType): ActivePiece {
  return { type, rotation: 0, x: 3, y: 0 }
}

function takeFromBag(bag: PieceType[]): { type: PieceType; bag: PieceType[] } {
  let nextBag = bag.slice()
  if (nextBag.length === 0) nextBag = shuffleBag()
  const type = nextBag[0]
  return { type, bag: nextBag.slice(1) }
}

function clearLines(board: CellColor[][]): { board: CellColor[][]; cleared: number } {
  const kept = board.filter((row) => row.some((c) => c === null))
  const cleared = TOTAL_ROWS - kept.length
  while (kept.length < TOTAL_ROWS) {
    kept.unshift(Array.from({ length: COLS }, () => null))
  }
  return { board: kept, cleared }
}

function scoreForLines(cleared: number, level: number): number {
  const table = [0, 100, 300, 500, 800]
  return (table[cleared] ?? 0) * level
}

export function createInitialState(): TetrisState {
  let bag = shuffleBag()
  const first = takeFromBag(bag)
  bag = first.bag
  const second = takeFromBag(bag)
  bag = second.bag
  return {
    board: emptyBoard(),
    active: spawnPiece(first.type),
    next: second.type,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    gameOver: false,
    bag,
  }
}

function lockPiece(state: TetrisState): TetrisState {
  if (!state.active) return state
  const board = state.board.map((row) => row.slice())
  for (const c of cellsOf(state.active)) {
    if (c.y < 0) {
      return { ...state, gameOver: true, active: null }
    }
    board[c.y][c.x] = state.active.type
  }

  const { board: clearedBoard, cleared } = clearLines(board)
  const lines = state.lines + cleared
  const level = Math.floor(lines / 10) + 1
  const score = state.score + scoreForLines(cleared, state.level) + 10

  const pulled = takeFromBag(state.bag)
  const active = spawnPiece(state.next)

  if (collides(clearedBoard, active)) {
    return {
      ...state,
      board: clearedBoard,
      active: null,
      next: pulled.type,
      bag: pulled.bag,
      score,
      lines,
      level,
      gameOver: true,
      canHold: true,
    }
  }

  return {
    ...state,
    board: clearedBoard,
    active,
    next: pulled.type,
    bag: pulled.bag,
    score,
    lines,
    level,
    canHold: true,
  }
}

export function tick(state: TetrisState): TetrisState {
  if (state.gameOver || !state.active) return state
  const moved = { ...state.active, y: state.active.y + 1 }
  if (!collides(state.board, moved)) {
    return { ...state, active: moved }
  }
  return lockPiece(state)
}

export function move(state: TetrisState, dx: number): TetrisState {
  if (state.gameOver || !state.active) return state
  const moved = { ...state.active, x: state.active.x + dx }
  if (collides(state.board, moved)) return state
  return { ...state, active: moved }
}

export function rotate(state: TetrisState, dir: 1 | -1 = 1): TetrisState {
  if (state.gameOver || !state.active) return state
  const nextRot = (state.active.rotation + dir + 4) % 4
  const kicks = [0, -1, 1, -2, 2]
  for (const kx of kicks) {
    const candidate = { ...state.active, rotation: nextRot, x: state.active.x + kx }
    if (!collides(state.board, candidate)) {
      return { ...state, active: candidate }
    }
  }
  return state
}

export function hardDrop(state: TetrisState): TetrisState {
  if (state.gameOver || !state.active) return state
  let y = state.active.y
  while (!collides(state.board, { ...state.active, y: y + 1 })) y++
  const dropped = { ...state, active: { ...state.active, y }, score: state.score + (y - state.active.y) * 2 }
  return lockPiece(dropped)
}

export function softDrop(state: TetrisState): TetrisState {
  if (state.gameOver || !state.active) return state
  const moved = { ...state.active, y: state.active.y + 1 }
  if (!collides(state.board, moved)) {
    return { ...state, active: moved, score: state.score + 1 }
  }
  return lockPiece(state)
}

export function hold(state: TetrisState): TetrisState {
  if (state.gameOver || !state.active || !state.canHold) return state
  const current = state.active.type
  if (state.hold === null) {
    const pulled = takeFromBag(state.bag)
    const active = spawnPiece(state.next)
    if (collides(state.board, active)) {
      return { ...state, gameOver: true, active: null }
    }
    return {
      ...state,
      hold: current,
      active,
      next: pulled.type,
      bag: pulled.bag,
      canHold: false,
    }
  }
  const active = spawnPiece(state.hold)
  if (collides(state.board, active)) return state
  return {
    ...state,
    hold: current,
    active,
    canHold: false,
  }
}

export function ghostY(state: TetrisState): number | null {
  if (!state.active) return null
  let y = state.active.y
  while (!collides(state.board, { ...state.active, y: y + 1 })) y++
  return y
}

export function cellsForRender(piece: ActivePiece): Point[] {
  return cellsOf(piece)
}

export function tickMsForLevel(baseTickMs: number, level: number): number {
  return Math.max(80, baseTickMs - (level - 1) * 40)
}

export function bestScoreKey(difficulty: TetrisDifficulty): string {
  return `nahaber_tetris_best_${difficulty}`
}
