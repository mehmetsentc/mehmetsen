/**
 * Smart Feed category presentation skins.
 * Copy is always bottom lower-third; typography is global for readability.
 * Skins only vary accent / badge / motion accents.
 */

export type FeedCardLayout = 'bottom'
export type FeedCardFrame = 'none' | 'thin' | 'magazine'
export type FeedCardBadge = 'solid' | 'ghost'
export type FeedCardPanel = 'dark' | 'soft' | 'none'

export type FeedCardSkinId =
  | 'son-dakika'
  | 'gundem'
  | 'siyaset'
  | 'magazin'
  | 'kultur'
  | 'spor'
  | 'ekonomi'
  | 'teknoloji'
  | 'dunya'
  | 'saglik'
  | 'yerel'
  | 'gastronomi'
  | 'default'

/** Global Reels-card type — same on every category. */
export const FEED_GLOBAL_HEADLINE_CLASS =
  'text-[1.35rem] font-extrabold leading-[1.22] tracking-[-0.02em] text-white sm:text-[1.45rem]'
export const FEED_GLOBAL_SUMMARY_CLASS =
  'text-[0.98rem] font-medium leading-[1.45] text-white/92 sm:text-[1.02rem]'

export interface FeedCardSkin {
  id: FeedCardSkinId
  layout: FeedCardLayout
  liveBar: boolean
  wipe: boolean
  ticker: boolean
  frame: FeedCardFrame
  badge: FeedCardBadge
  panel: FeedCardPanel
  accent: string
  typeMs: number
  headlineClass: string
  summaryClass: string
}

function skin(
  id: FeedCardSkinId,
  opts: {
    liveBar?: boolean
    wipe?: boolean
    ticker?: boolean
    frame?: FeedCardFrame
    badge?: FeedCardBadge
    accent: string
    typeMs?: number
  }
): FeedCardSkin {
  return {
    id,
    layout: 'bottom',
    liveBar: Boolean(opts.liveBar),
    wipe: Boolean(opts.wipe),
    ticker: Boolean(opts.ticker),
    frame: opts.frame ?? 'none',
    badge: opts.badge ?? 'solid',
    panel: 'dark',
    accent: opts.accent,
    typeMs: opts.typeMs ?? 26,
    headlineClass: FEED_GLOBAL_HEADLINE_CLASS,
    summaryClass: FEED_GLOBAL_SUMMARY_CLASS,
  }
}

const SKINS: Record<FeedCardSkinId, FeedCardSkin> = {
  'son-dakika': skin('son-dakika', { liveBar: true, accent: '#e11d2e', typeMs: 20 }),
  gundem: skin('gundem', { accent: '#e11d2e' }),
  siyaset: skin('siyaset', { badge: 'ghost', accent: '#94a3b8' }),
  magazin: skin('magazin', { frame: 'magazine', badge: 'ghost', accent: '#f4b460', typeMs: 30 }),
  kultur: skin('kultur', { badge: 'ghost', accent: '#e8c4a8' }),
  spor: skin('spor', { wipe: true, accent: '#16a34a', typeMs: 16 }),
  ekonomi: skin('ekonomi', { ticker: true, accent: '#2563eb' }),
  teknoloji: skin('teknoloji', { accent: '#06b6d4' }),
  dunya: skin('dunya', { badge: 'ghost', accent: '#64748b' }),
  saglik: skin('saglik', { accent: '#14b8a6' }),
  yerel: skin('yerel', { accent: '#e11d2e' }),
  gastronomi: skin('gastronomi', { badge: 'ghost', accent: '#f97316' }),
  default: skin('default', { accent: '#e11d2e' }),
}

const ALIASES: Record<string, FeedCardSkinId> = {
  'son-dakika': 'son-dakika',
  breaking: 'son-dakika',
  gundem: 'gundem',
  siyaset: 'siyaset',
  magazin: 'magazin',
  kultur: 'kultur',
  sinema: 'kultur',
  spor: 'spor',
  futbol: 'spor',
  basketbol: 'spor',
  ekonomi: 'ekonomi',
  borsa: 'ekonomi',
  finans: 'ekonomi',
  teknoloji: 'teknoloji',
  dunya: 'dunya',
  saglik: 'saglik',
  yerel: 'yerel',
  'yerel-haber': 'yerel',
  gastronomi: 'gastronomi',
  bilim: 'teknoloji',
}

export function resolveFeedCardSkin(
  category?: string | null,
  opts?: { breaking?: boolean }
): FeedCardSkin {
  if (opts?.breaking) return SKINS['son-dakika']
  const key = (category || '').trim().toLowerCase()
  const id = ALIASES[key] ?? 'default'
  return SKINS[id]
}

export function listFeedCardSkins(): FeedCardSkin[] {
  return Object.values(SKINS).filter((s) => s.id !== 'default')
}
