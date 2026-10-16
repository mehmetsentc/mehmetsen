/**
 * FEED-UX-3 — the feed photo is laid out by its real shape (phones only):
 *   portrait  (taller than wide)  → the photo fills the card from the top, full width,
 *                                   at its real height (a 9:16 photo fills the screen);
 *   landscape / square            → full width at its real height (a 16:9 photo is
 *                                   100vw × 56vw), never shrunk to a thumbnail; the copy
 *                                   box gives up the room it needs.
 * ratio = naturalHeight / naturalWidth.
 */
export type FeedHeroShape = 'unknown' | 'portrait' | 'landscape'

export const PORTRAIT_MIN_RATIO = 1.05
/** A landscape photo may take up to this much of the screen height. */
export const LANDSCAPE_MAX_DVH = 48
/** The old floor of the photo box (HERO_FRAME min-h). */
export const HERO_BASE_DVH = 26

export function feedHeroShape(ratio: number | null | undefined): FeedHeroShape {
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return 'unknown'
  return ratio > PORTRAIT_MIN_RATIO ? 'portrait' : 'landscape'
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Height of a full-width landscape photo, capped. */
export function landscapeHeroHeight(ratio: number): string {
  return `min(calc(100vw * ${r3(ratio)}), ${LANDSCAPE_MAX_DVH}dvh)`
}

/** Extra room the copy box gives up so the landscape photo keeps its real size. */
export function landscapeCopyGive(ratio: number): string {
  return `max(0px, ${landscapeHeroHeight(ratio)} - ${HERO_BASE_DVH}dvh)`
}

/** Height of the full-width portrait layer (fills the card when the photo is tall enough). */
export function portraitHeroHeight(ratio: number): string {
  return `min(calc(100vw * ${r3(ratio)}), 100%)`
}

/** Shapes measured this visit, so a card seen again lays out at once. */
export const heroRatioCache = new Map<string, number>()
