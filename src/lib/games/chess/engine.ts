export type Color = 'w' | 'b'
export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'

export type Piece = { color: Color; type: PieceType }

export type CastlingRights = { k: boolean; q: boolean }

export type ChessState = {
  squares: (Piece | null)[]
  turn: Color
  castling: { w: CastlingRights; b: CastlingRights }
  enPassant: number | null
  status: 'active' | 'checkmate' | 'stalemate'
  winner: Color | null
  inCheck: boolean
}

export type Move = {
  from: number
  to: number
  promotion?: PieceType
}

const KNIGHT_DELTAS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
]

const KING_DELTAS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

const BISHOP_DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]
const ROOK_DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

export function fileOf(sq: number): number {
  return sq % 8
}

export function rankOf(sq: number): number {
  return Math.floor(sq / 8)
}

export function sq(file: number, rank: number): number {
  return rank * 8 + file
}

export function opponent(c: Color): Color {
  return c === 'w' ? 'b' : 'w'
}

function cloneSquares(squares: (Piece | null)[]): (Piece | null)[] {
  return squares.map((p) => (p ? { ...p } : null))
}

const INITIAL =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function pieceFromChar(ch: string): Piece | null {
  const map: Record<string, Piece> = {
    K: { color: 'w', type: 'K' },
    Q: { color: 'w', type: 'Q' },
    R: { color: 'w', type: 'R' },
    B: { color: 'w', type: 'B' },
    N: { color: 'w', type: 'N' },
    P: { color: 'w', type: 'P' },
    k: { color: 'b', type: 'K' },
    q: { color: 'b', type: 'Q' },
    r: { color: 'b', type: 'R' },
    b: { color: 'b', type: 'B' },
    n: { color: 'b', type: 'N' },
    p: { color: 'b', type: 'P' },
  }
  return map[ch] ?? null
}

export function createInitialState(fen: string = INITIAL): ChessState {
  const parts = fen.trim().split(/\s+/)
  const rows = parts[0].split('/')
  const squares: (Piece | null)[] = []
  for (const row of rows) {
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        const n = Number(ch)
        for (let i = 0; i < n; i++) squares.push(null)
      } else {
        squares.push(pieceFromChar(ch))
      }
    }
  }
  const turn: Color = parts[1] === 'b' ? 'b' : 'w'
  const castStr = parts[2] ?? '-'
  const castling = {
    w: { k: castStr.includes('K'), q: castStr.includes('Q') },
    b: { k: castStr.includes('k'), q: castStr.includes('q') },
  }
  let enPassant: number | null = null
  if (parts[3] && parts[3] !== '-') {
    const f = parts[3].charCodeAt(0) - 'a'.charCodeAt(0)
    const r = 8 - Number(parts[3][1])
    enPassant = sq(f, r)
  }
  const state = finalizeState(squares, turn, castling, enPassant)
  return state
}

function findKing(squares: (Piece | null)[], color: Color): number | null {
  for (let i = 0; i < 64; i++) {
    const p = squares[i]
    if (p && p.type === 'K' && p.color === color) return i
  }
  return null
}

function inBounds(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8
}

function isSquareAttacked(
  squares: (Piece | null)[],
  target: number,
  byColor: Color
): boolean {
  const tf = fileOf(target)
  const tr = rankOf(target)

  for (const [df, dr] of KNIGHT_DELTAS) {
    const f = tf + df
    const r = tr + dr
    if (!inBounds(f, r)) continue
    const p = squares[sq(f, r)]
    if (p && p.color === byColor && p.type === 'N') return true
  }

  for (const [df, dr] of KING_DELTAS) {
    const f = tf + df
    const r = tr + dr
    if (!inBounds(f, r)) continue
    const p = squares[sq(f, r)]
    if (p && p.color === byColor && p.type === 'K') return true
  }

  for (const [df, dr] of BISHOP_DIRS) {
    let f = tf + df
    let r = tr + dr
    while (inBounds(f, r)) {
      const p = squares[sq(f, r)]
      if (p) {
        if (p.color === byColor && (p.type === 'B' || p.type === 'Q')) return true
        break
      }
      f += df
      r += dr
    }
  }

  for (const [df, dr] of ROOK_DIRS) {
    let f = tf + df
    let r = tr + dr
    while (inBounds(f, r)) {
      const p = squares[sq(f, r)]
      if (p) {
        if (p.color === byColor && (p.type === 'R' || p.type === 'Q')) return true
        break
      }
      f += df
      r += dr
    }
  }

  const pawnDir = byColor === 'w' ? 1 : -1
  for (const df of [-1, 1]) {
    const f = tf + df
    const r = tr + pawnDir
    if (!inBounds(f, r)) continue
    const p = squares[sq(f, r)]
    if (p && p.color === byColor && p.type === 'P') return true
  }

  return false
}

export function isInCheck(state: ChessState, color: Color): boolean {
  const kingSq = findKing(state.squares, color)
  if (kingSq === null) return false
  return isSquareAttacked(state.squares, kingSq, opponent(color))
}

function applyMoveOnSquares(
  squares: (Piece | null)[],
  move: Move,
  state: ChessState
): { squares: (Piece | null)[]; enPassant: number | null; castling: ChessState['castling'] } {
  const next = cloneSquares(squares)
  const piece = next[move.from]
  if (!piece) return { squares: next, enPassant: null, castling: state.castling }

  let castling = {
    w: { ...state.castling.w },
    b: { ...state.castling.b },
  }

  if (piece.type === 'K') {
    castling[piece.color] = { k: false, q: false }
    const fromF = fileOf(move.from)
    const fromR = rankOf(move.from)
    const toF = fileOf(move.to)
    if (Math.abs(toF - fromF) === 2) {
      if (toF > fromF) {
        const rookFrom = sq(7, fromR)
        const rookTo = sq(5, fromR)
        next[rookTo] = next[rookFrom]
        next[rookFrom] = null
      } else {
        const rookFrom = sq(0, fromR)
        const rookTo = sq(3, fromR)
        next[rookTo] = next[rookFrom]
        next[rookFrom] = null
      }
    }
  }

  if (piece.type === 'R') {
    const f = fileOf(move.from)
    const r = rankOf(move.from)
    if (piece.color === 'w' && r === 7) {
      if (f === 7) castling.w.k = false
      if (f === 0) castling.w.q = false
    }
    if (piece.color === 'b' && r === 0) {
      if (f === 7) castling.b.k = false
      if (f === 0) castling.b.q = false
    }
  }

  if (piece.type === 'P' && move.to === state.enPassant) {
    const capRank = rankOf(move.from)
    const capSq = sq(fileOf(move.to), capRank)
    next[capSq] = null
  }

  next[move.to] = piece
  next[move.from] = null

  if (piece.type === 'P' && (rankOf(move.to) === 0 || rankOf(move.to) === 7)) {
    next[move.to] = { color: piece.color, type: move.promotion ?? 'Q' }
  }

  let enPassant: number | null = null
  if (piece.type === 'P') {
    const fromR = rankOf(move.from)
    const toR = rankOf(move.to)
    if (piece.color === 'w' && fromR === 6 && toR === 4) {
      enPassant = sq(fileOf(move.to), 5)
    }
    if (piece.color === 'b' && fromR === 1 && toR === 3) {
      enPassant = sq(fileOf(move.to), 2)
    }
  }

  return { squares: next, enPassant, castling }
}

function pseudoLegalMoves(state: ChessState, color: Color): Move[] {
  const moves: Move[] = []
  const { squares, castling, enPassant } = state

  for (let from = 0; from < 64; from++) {
    const piece = squares[from]
    if (!piece || piece.color !== color) continue
    const ff = fileOf(from)
    const fr = rankOf(from)

    if (piece.type === 'N' || piece.type === 'K') {
      const deltas = piece.type === 'N' ? KNIGHT_DELTAS : KING_DELTAS
      for (const [df, dr] of deltas) {
        const f = ff + df
        const r = fr + dr
        if (!inBounds(f, r)) continue
        const to = sq(f, r)
        const target = squares[to]
        if (target && target.color === color) continue
        moves.push({ from, to })
      }
      if (piece.type === 'K') {
        const rights = castling[color]
        const homeRank = color === 'w' ? 7 : 0
        if (fr === homeRank && ff === 4) {
          if (rights.k && !squares[sq(5, homeRank)] && !squares[sq(6, homeRank)]) {
            const rook = squares[sq(7, homeRank)]
            if (rook && rook.type === 'R' && rook.color === color) {
              moves.push({ from, to: sq(6, homeRank) })
            }
          }
          if (
            rights.q &&
            !squares[sq(1, homeRank)] &&
            !squares[sq(2, homeRank)] &&
            !squares[sq(3, homeRank)]
          ) {
            const rook = squares[sq(0, homeRank)]
            if (rook && rook.type === 'R' && rook.color === color) {
              moves.push({ from, to: sq(2, homeRank) })
            }
          }
        }
      }
      continue
    }

    if (piece.type === 'P') {
      const forward = color === 'w' ? -1 : 1
      const startRank = color === 'w' ? 6 : 1
      const promoRank = color === 'w' ? 0 : 7
      const one = sq(ff, fr + forward)
      if (inBounds(ff, fr + forward) && !squares[one]) {
        if (fr + forward === promoRank) {
          for (const promo of ['Q', 'R', 'B', 'N'] as PieceType[]) {
            moves.push({ from, to: one, promotion: promo })
          }
        } else {
          moves.push({ from, to: one })
          const two = sq(ff, fr + 2 * forward)
          if (fr === startRank && !squares[two]) moves.push({ from, to: two })
        }
      }
      for (const df of [-1, 1]) {
        const f = ff + df
        const r = fr + forward
        if (!inBounds(f, r)) continue
        const to = sq(f, r)
        const target = squares[to]
        if (target && target.color !== color) {
          if (r === promoRank) {
            for (const promo of ['Q', 'R', 'B', 'N'] as PieceType[]) {
              moves.push({ from, to, promotion: promo })
            }
          } else {
            moves.push({ from, to })
          }
        } else if (to === enPassant) {
          moves.push({ from, to })
        }
      }
      continue
    }

    const dirs =
      piece.type === 'B' ? BISHOP_DIRS : piece.type === 'R' ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS]
    for (const [df, dr] of dirs) {
      let f = ff + df
      let r = fr + dr
      while (inBounds(f, r)) {
        const to = sq(f, r)
        const target = squares[to]
        if (!target) {
          moves.push({ from, to })
        } else {
          if (target.color !== color) moves.push({ from, to })
          break
        }
        f += df
        r += dr
      }
    }
  }

  return moves
}

function legalAfterFilter(state: ChessState, moves: Move[], color: Color): Move[] {
  return moves.filter((move) => {
    const applied = applyMoveOnSquares(state.squares, move, state)
    const kingSq = findKing(applied.squares, color)
    if (kingSq === null) return false
    if (isSquareAttacked(applied.squares, kingSq, opponent(color))) return false

    if (state.squares[move.from]?.type === 'K') {
      const fromF = fileOf(move.from)
      const toF = fileOf(move.to)
      if (Math.abs(toF - fromF) === 2) {
        const rank = rankOf(move.from)
        const step = toF > fromF ? 1 : -1
        for (let f = fromF; f !== toF; f += step) {
          const sqCheck = sq(f, rank)
          if (isSquareAttacked(state.squares, sqCheck, opponent(color))) return false
        }
        if (isSquareAttacked(state.squares, move.to, opponent(color))) return false
      }
    }
    return true
  })
}

export function getLegalMoves(state: ChessState): Move[] {
  if (state.status !== 'active') return []
  return legalAfterFilter(state, pseudoLegalMoves(state, state.turn), state.turn)
}

function finalizeState(
  squares: (Piece | null)[],
  turn: Color,
  castling: ChessState['castling'],
  enPassant: number | null
): ChessState {
  const draft: ChessState = {
    squares,
    turn,
    castling,
    enPassant,
    status: 'active',
    winner: null,
    inCheck: false,
  }
  draft.inCheck = isInCheck(draft, turn)
  const legal = legalAfterFilter(draft, pseudoLegalMoves(draft, turn), turn)
  if (legal.length === 0) {
    if (draft.inCheck) {
      draft.status = 'checkmate'
      draft.winner = opponent(turn)
    } else {
      draft.status = 'stalemate'
    }
  }
  return draft
}

export function applyMove(state: ChessState, move: Move): ChessState | null {
  if (state.status !== 'active') return null
  const legal = getLegalMoves(state)
  const ok = legal.some(
    (m) =>
      m.from === move.from &&
      m.to === move.to &&
      (m.promotion ?? 'Q') === (move.promotion ?? 'Q')
  )
  if (!ok) return null

  const applied = applyMoveOnSquares(state.squares, move, state)
  const nextTurn = opponent(state.turn)
  return finalizeState(applied.squares, nextTurn, applied.castling, applied.enPassant)
}

export function moveKey(m: Move): string {
  return `${m.from}-${m.to}-${m.promotion ?? ''}`
}

export function colorLabel(c: Color, vsCpu: boolean): string {
  if (!vsCpu) return c === 'w' ? 'Beyaz' : 'Siyah'
  return c === 'w' ? 'Sen (beyaz)' : 'Bilgisayar (siyah)'
}

const PIECE_UNICODE: Record<Color, Record<PieceType, string>> = {
  w: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
  b: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' },
}

export function pieceSymbol(piece: Piece): string {
  return PIECE_UNICODE[piece.color][piece.type]
}
