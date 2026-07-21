/**
 * Tavla (backgammon) — yerel iki oyuncu MVP.
 */
export type PlayerId = 1 | 2

export interface BackgammonState {
  points: number[]
  bar: { p1: number; p2: number }
  off: { p1: number; p2: number }
  turn: PlayerId
  dice: number[]
  usedDice: boolean[]
  winner: PlayerId | null
}

export type MoveFrom = number | 'bar'
export type MoveTo = number | 'off'

export interface Move {
  from: MoveFrom
  to: MoveTo
  die: number
}

export function createInitialState(): BackgammonState {
  const points = new Array<number>(24).fill(0)
  points[0] = 2
  points[11] = 5
  points[16] = 3
  points[18] = 5
  points[23] = -2
  points[12] = -5
  points[7] = -3
  points[5] = -5

  return {
    points,
    bar: { p1: 0, p2: 0 },
    off: { p1: 0, p2: 0 },
    turn: 1,
    dice: [],
    usedDice: [],
    winner: null,
  }
}

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1
}

export function rollDice(state: BackgammonState): BackgammonState {
  if (state.winner || state.dice.length > 0) return state
  const a = rollDie()
  const b = rollDie()
  const dice = a === b ? [a, a, a, a] : [a, b]
  return { ...state, dice, usedDice: dice.map(() => false) }
}

function playerSign(p: PlayerId): number {
  return p === 1 ? 1 : -1
}

function opponent(p: PlayerId): PlayerId {
  return p === 1 ? 2 : 1
}

function countAt(points: number[], index: number, player: PlayerId): number {
  const v = points[index]
  if (player === 1) return v > 0 ? v : 0
  return v < 0 ? -v : 0
}

function canLand(points: number[], index: number, player: PlayerId): boolean {
  if (index < 0 || index > 23) return false
  const v = points[index]
  const sign = playerSign(player)
  if (v === 0) return true
  if (Math.sign(v) === sign) return true
  return Math.abs(v) === 1
}

function mustFromBar(state: BackgammonState, player: PlayerId): boolean {
  return player === 1 ? state.bar.p1 > 0 : state.bar.p2 > 0
}

function allInHome(state: BackgammonState, player: PlayerId): boolean {
  if (player === 1) {
    if (state.bar.p1 > 0) return false
    for (let i = 6; i < 24; i++) if (state.points[i] > 0) return false
    return true
  }
  if (state.bar.p2 > 0) return false
  for (let i = 0; i < 18; i++) if (state.points[i] < 0) return false
  return true
}

function unusedDiceValues(state: BackgammonState): number[] {
  return state.dice.filter((_, i) => !state.usedDice[i])
}

export function getLegalMoves(state: BackgammonState): Move[] {
  if (state.winner || state.dice.length === 0) return []
  const player = state.turn
  const moves: Move[] = []
  const dice = unusedDiceValues(state)
  const uniqueDice = [...new Set(dice)]

  if (mustFromBar(state, player)) {
    for (const die of uniqueDice) {
      const entry = player === 1 ? 24 - die : die - 1
      if (canLand(state.points, entry, player)) {
        moves.push({ from: 'bar', to: entry, die })
      }
    }
    return moves
  }

  for (const die of uniqueDice) {
    for (let from = 0; from < 24; from++) {
      if (countAt(state.points, from, player) === 0) continue

      const to = player === 1 ? from - die : from + die

      if (to >= 0 && to <= 23 && canLand(state.points, to, player)) {
        moves.push({ from, to, die })
        continue
      }

      if (allInHome(state, player)) {
        if (player === 1 && to < 0) {
          const exact = from + 1
          if (die === exact || (die > exact && !uniqueDice.includes(exact))) {
            moves.push({ from, to: 'off', die })
          }
        }
        if (player === 2 && to > 23) {
          const exact = 24 - from
          if (die === exact || (die > exact && !uniqueDice.includes(exact))) {
            moves.push({ from, to: 'off', die })
          }
        }
      }
    }
  }

  return moves
}

function markDieUsed(state: BackgammonState, die: number): boolean[] {
  const used = [...state.usedDice]
  const idx = state.dice.findIndex((d, i) => d === die && !used[i])
  if (idx >= 0) used[idx] = true
  return used
}

function placeChecker(
  points: number[],
  to: number,
  player: PlayerId,
  bar: { p1: number; p2: number }
): void {
  const sign = playerSign(player)
  const v = points[to]
  if (v !== 0 && Math.sign(v) !== sign) {
    if (sign === 1) bar.p2 += 1
    else bar.p1 += 1
    points[to] = sign
  } else {
    points[to] += sign
  }
}

export function applyMove(state: BackgammonState, move: Move): BackgammonState | null {
  const legal = getLegalMoves(state)
  if (!legal.some((m) => m.from === move.from && m.to === move.to && m.die === move.die)) {
    return null
  }

  const player = state.turn
  const points = [...state.points]
  const bar = { ...state.bar }
  const off = { ...state.off }

  if (move.from === 'bar' && typeof move.to === 'number') {
    if (player === 1) bar.p1 -= 1
    else bar.p2 -= 1
    placeChecker(points, move.to, player, bar)
  } else if (typeof move.from === 'number' && move.to === 'off') {
    if (player === 1) {
      points[move.from] -= 1
      off.p1 += 1
    } else {
      points[move.from] += 1
      off.p2 += 1
    }
  } else if (typeof move.from === 'number' && typeof move.to === 'number') {
    if (player === 1) points[move.from] -= 1
    else points[move.from] += 1
    placeChecker(points, move.to, player, bar)
  }

  let usedDice = markDieUsed(state, move.die)
  let dice = state.dice
  let turn = state.turn

  const diceRemaining = usedDice.some((u) => !u)
  let nextState: BackgammonState = {
    points,
    bar,
    off,
    turn,
    dice,
    usedDice,
    winner: null,
  }

  if (diceRemaining) {
    const left = getLegalMoves(nextState)
    if (left.length === 0) {
      nextState = { ...nextState, turn: opponent(player), dice: [], usedDice: [] }
    }
  } else {
    nextState = { ...nextState, turn: opponent(player), dice: [], usedDice: [] }
  }

  if (off.p1 >= 15) nextState.winner = 1
  if (off.p2 >= 15) nextState.winner = 2

  return nextState
}

export function canRoll(state: BackgammonState): boolean {
  return !state.winner && state.dice.length === 0
}

export function playerLabel(p: PlayerId, vsCpu = false): string {
  if (vsCpu && p === 1) return 'Sen (Açık)'
  if (vsCpu && p === 2) return 'Bilgisayar (Koyu)'
  return p === 1 ? 'Oyuncu 1 (Açık)' : 'Oyuncu 2 (Koyu)'
}
