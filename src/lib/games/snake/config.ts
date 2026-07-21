export type SnakeDifficulty = 'easy' | 'medium' | 'hard'

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface SnakeDifficultyConfig {
  id: SnakeDifficulty
  label: string
  description: string
  tickMs: number
  accent: string
}

export const SNAKE_DIFFICULTIES: SnakeDifficultyConfig[] = [
  {
    id: 'easy',
    label: 'Kolay',
    description: 'Rahat tempo — yeni başlayanlar için',
    tickMs: 165,
    accent: 'from-emerald-400 to-teal-500',
  },
  {
    id: 'medium',
    label: 'Orta',
    description: 'Dengeli hız ve refleks',
    tickMs: 108,
    accent: 'from-violet-400 to-fuchsia-500',
  },
  {
    id: 'hard',
    label: 'Zor',
    description: 'Neon hız — usta modu',
    tickMs: 72,
    accent: 'from-rose-500 to-orange-500',
  },
]

export const GRID_COLS = 18
export const GRID_ROWS = 22

export function bestScoreKey(difficulty: SnakeDifficulty): string {
  return `nahaber_snake_best_${difficulty}`
}
