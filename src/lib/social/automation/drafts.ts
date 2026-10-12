/**
 * Suggested CLOSED automation rule drafts (Görev 18) — pure.
 *
 *   il hesabı    : <il> VE (Asayiş kategorileri VEYA ilde öne çıkan)
 *   merkez hesabı: Ulusal haber VE (Asayiş kategorileri VEYA ulusal öne çıkan)
 *
 * Posts only (stories need their own explicit rule with a featured condition),
 * ≤5 per day, ≥15 minutes apart, quiet 00:00–07:00 Europe/Istanbul. The server
 * creates every rule disabled; enabling is a separate, confirmed step and never
 * back-fills older news.
 */
import type { AutomationRuleInput } from './types'

/** «Asayiş» (ulusal ağaç) + «Yerel Asayiş» (yerel ağaç); parent ids also match their subcategories. */
export const ASAYIS_CATEGORY_IDS = ['asayis', 'yerel-asayis'] as const

type DraftAccount = {
  id: string
  displayName: string
  username: string | null
  ownerKind: string
  ownership: { citySlug: string | null }
}

export function draftRuleFor(a: DraftAccount, provinceName: (slug: string) => string): AutomationRuleInput | null {
  const base = {
    accountId: a.id,
    categoryIds: [...ASAYIS_CATEGORY_IDS],
    allCategories: false,
    featuredMode: 'categories_or_featured' as const,
    formats: ['post' as const],
    dailyLimit: 5,
    minIntervalMinutes: 15,
    quietHours: { startHour: 0, endHour: 7 },
  }
  if (a.ownerKind === 'province' && a.ownership.citySlug) {
    return { ...base, name: `${provinceName(a.ownership.citySlug)} — Asayiş veya il öne çıkan`, geo: { kind: 'provinces', citySlugs: [a.ownership.citySlug] }, featuredKind: 'local' }
  }
  if (a.ownerKind === 'central') {
    // Yerel Asayiş never counts as national (yerel tree) → only the national «Asayiş».
    return { ...base, name: 'Ulusal — Asayiş veya ulusal öne çıkan', geo: { kind: 'national' }, categoryIds: ['asayis'], featuredKind: 'national' }
  }
  return null
}
