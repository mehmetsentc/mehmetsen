import { DEFAULT_CATEGORIES } from '@/constants/config'

const FALLBACK_ACCENT = '#6B7280'

/** Category top-border accent color for desktop newspaper sections. */
export function getCategoryAccentColor(categoryId: string): string {
  const normalized = categoryId.trim().toLowerCase()
  const match = DEFAULT_CATEGORIES.find((c) => c.id === normalized)
  return match?.color ?? FALLBACK_ACCENT
}
