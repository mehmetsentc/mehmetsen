/** Per-game level progression: 1 (kolay) → 2 (orta) → 3 (zor). */

export type GameLevelId = 1 | 2 | 3

export type GameLevelDef = {
  id: GameLevelId
  label: string
  /** Matches existing difficulty ids where applicable */
  key: 'easy' | 'medium' | 'hard'
}

export const GAME_LEVELS: GameLevelDef[] = [
  { id: 1, label: 'Kolay', key: 'easy' },
  { id: 2, label: 'Orta', key: 'medium' },
  { id: 3, label: 'Zor', key: 'hard' },
]

type ProgressState = {
  unlocked: GameLevelId
}

function storageKey(gameSlug: string, userId: string): string {
  return `nahaber_game_lvl_${userId}_${gameSlug}`
}

function readProgress(gameSlug: string, userId: string): ProgressState {
  if (typeof window === 'undefined') return { unlocked: 1 }
  try {
    const raw = localStorage.getItem(storageKey(gameSlug, userId))
    if (!raw) return { unlocked: 1 }
    const parsed = JSON.parse(raw) as { unlocked?: number }
    const unlocked = parsed.unlocked
    if (unlocked === 2 || unlocked === 3) return { unlocked }
    return { unlocked: 1 }
  } catch {
    return { unlocked: 1 }
  }
}

function writeProgress(gameSlug: string, userId: string, state: ProgressState): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(storageKey(gameSlug, userId), JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function getUnlockedLevel(gameSlug: string, userId: string): GameLevelId {
  return readProgress(gameSlug, userId).unlocked
}

export function isLevelUnlocked(
  gameSlug: string,
  userId: string,
  level: GameLevelId
): boolean {
  return level <= getUnlockedLevel(gameSlug, userId)
}

/** Call after beating `beatenLevel` — unlocks the next level if any. */
export function unlockNextLevel(
  gameSlug: string,
  userId: string,
  beatenLevel: GameLevelId
): GameLevelId {
  const current = getUnlockedLevel(gameSlug, userId)
  const next = Math.min(3, beatenLevel + 1) as GameLevelId
  const unlocked = Math.max(current, next) as GameLevelId
  writeProgress(gameSlug, userId, { unlocked })
  return unlocked
}

export function levelFromDifficultyKey(key: 'easy' | 'medium' | 'hard'): GameLevelId {
  if (key === 'hard') return 3
  if (key === 'medium') return 2
  return 1
}

export function difficultyKeyFromLevel(level: GameLevelId): 'easy' | 'medium' | 'hard' {
  return GAME_LEVELS.find((l) => l.id === level)!.key
}
