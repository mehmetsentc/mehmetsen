import { DEFAULT_CATEGORIES, getParentCategory } from '@/constants/config'

export interface CategoryAccent {
  /** Original hex, e.g. "#EF4444" */
  hex: string
  /** RGB triple for CSS custom properties, e.g. "239 68 68" */
  rgb: string
  /** Short kicker/eyebrow shown above the page title */
  kicker: string
}

const HEX_BY_ID: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.id, c.color])
)

/**
 * Curated, high-contrast accent colours for the main sections. These override
 * the muted config colours (e.g. Dünya is a flat grey in config) with a bolder
 * "global newsroom" palette that reads well on both light and dark themes.
 */
const ACCENT_OVERRIDES: Record<string, string> = {
  gundem: '#E11D48',
  dunya: '#2563EB',
  siyaset: '#7C3AED',
  ekonomi: '#F59E0B',
  spor: '#059669',
  teknoloji: '#3B82F6',
  saglik: '#EC4899',
  kultur: '#8B5CF6',
  yasam: '#16A34A',
  magazin: '#DB2777',
  trend: '#FF6B35',
  bilim: '#14B8A6',
  'yerel-haber': '#0D9488',
}

const KICKER_BY_ID: Record<string, string> = {
  gundem: 'Son gelişmeler',
  dunya: 'Küresel gündem',
  siyaset: 'Politika',
  ekonomi: 'Piyasalar & ekonomi',
  spor: 'Sahadan',
  teknoloji: 'İnovasyon',
  saglik: 'Sağlıklı yaşam',
  kultur: 'Sanat & kültür',
  yasam: 'Yaşam',
  magazin: 'Magazin',
  bilim: 'Bilim',
  'yerel-haber': 'Yakınınızda',
}

function hexToRgbTriple(hex: string): string {
  const clean = hex.replace('#', '').trim()
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return '37 99 235'
  return `${r} ${g} ${b}`
}

/** Resolve the top-level (root) category id for any category or subcategory. */
export function getRootCategoryId(categoryId: string): string {
  const parent = getParentCategory(categoryId)
  return parent?.id ?? categoryId
}

/**
 * Accent theme (colour + kicker) for a category page. Subcategories inherit
 * their parent's accent so a section keeps a consistent visual identity.
 */
export function getCategoryAccent(categoryId: string): CategoryAccent {
  const rootId = getRootCategoryId(categoryId)
  const hex =
    ACCENT_OVERRIDES[rootId] ??
    ACCENT_OVERRIDES[categoryId] ??
    HEX_BY_ID[rootId] ??
    HEX_BY_ID[categoryId] ??
    '#2563EB'
  const kicker = KICKER_BY_ID[rootId] ?? KICKER_BY_ID[categoryId] ?? 'Güncel haberler'
  return { hex, rgb: hexToRgbTriple(hex), kicker }
}
