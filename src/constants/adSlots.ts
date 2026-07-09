import { DEFAULT_CATEGORIES } from '@/constants/config'
import type { AdBannerPage, AdBannerSize } from '@/types/adBanner'

export interface AdSlotDefinition {
  id: string
  label: string
  page: AdBannerPage
  categoryId?: string
  position: 'top' | 'mid' | 'bottom' | 'skyscraper'
  size: AdBannerSize
}

const HOME_SLOTS: AdSlotDefinition[] = [
  { id: 'leaderboard-top', label: 'Ana Sayfa — Üst (970×250)', page: 'home', position: 'top', size: 'large' },
  { id: 'leaderboard-mid', label: 'Ana Sayfa — Orta (970×90)', page: 'home', position: 'mid', size: 'leaderboard' },
  { id: 'leaderboard-bottom', label: 'Ana Sayfa — Alt (970×250)', page: 'home', position: 'bottom', size: 'large' },
]

const CATEGORY_POSITIONS = [
  { position: 'top' as const, size: 'large' as const, label: 'Üst (970×250)' },
  { position: 'skyscraper' as const, size: 'skyscraper' as const, label: 'Skyscraper (300×600)' },
  { position: 'mid' as const, size: 'leaderboard' as const, label: 'Orta (970×90)' },
  { position: 'bottom' as const, size: 'large' as const, label: 'Alt (970×250)' },
]

function categorySlotId(categoryId: string, position: string): string {
  return `category-${categoryId}-${position}`
}

export const AD_SLOT_DEFINITIONS: AdSlotDefinition[] = [
  ...HOME_SLOTS,
  ...DEFAULT_CATEGORIES.flatMap((cat) =>
    CATEGORY_POSITIONS.map((p) => ({
      id: categorySlotId(cat.id, p.position),
      label: `${cat.name} — ${p.label}`,
      page: 'category' as AdBannerPage,
      categoryId: cat.id,
      position: p.position,
      size: p.size,
    }))
  ),
]

export const AD_SLOT_MAP = Object.fromEntries(AD_SLOT_DEFINITIONS.map((s) => [s.id, s]))

export function getSlotDefinition(slotId: string): AdSlotDefinition | undefined {
  return AD_SLOT_MAP[slotId]
}

export function buildSlotId(
  page: AdBannerPage,
  position: 'top' | 'mid' | 'bottom' | 'skyscraper',
  categoryId?: string | null
): string {
  if (page === 'home') {
    if (position === 'top') return 'leaderboard-top'
    if (position === 'mid') return 'leaderboard-mid'
    return 'leaderboard-bottom'
  }
  if (page === 'all_categories') {
    return `category-all-${position}`
  }
  const cat = categoryId ?? 'gundem'
  return categorySlotId(cat, position)
}

export function getHomeAdSlotIds(): string[] {
  return HOME_SLOTS.map((s) => s.id)
}

export function getCategoryAdSlotIds(categoryId: string): string[] {
  return CATEGORY_POSITIONS.map((p) => categorySlotId(categoryId, p.position))
}

/** Admin dropdown — gruplu slot seçenekleri */
export function getAdminAdSlotGroups(): Array<{ label: string; slots: AdSlotDefinition[] }> {
  return [
    { label: 'Ana Sayfa', slots: HOME_SLOTS },
    {
      label: 'Tüm Kategoriler (genel)',
      slots: CATEGORY_POSITIONS.map((p) => ({
        id: `category-all-${p.position}`,
        label: `Tüm kategoriler — ${p.label}`,
        page: 'all_categories' as AdBannerPage,
        position: p.position,
        size: p.size,
      })),
    },
    ...DEFAULT_CATEGORIES.filter((c) => !c.parentId).map((cat) => ({
      label: cat.name,
      slots: CATEGORY_POSITIONS.map((p) => ({
        id: categorySlotId(cat.id, p.position),
        label: p.label,
        page: 'category' as AdBannerPage,
        categoryId: cat.id,
        position: p.position,
        size: p.size,
      })),
    })),
  ]
}
