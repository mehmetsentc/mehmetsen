/**
 * Smart Feed category presentation skins (Reels card costume).
 * Layout "center" = copy block starts mid-frame; "bottom" = classic lower-third.
 */

export type FeedCardLayout = 'bottom' | 'center'
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

export interface FeedCardSkin {
  id: FeedCardSkinId
  layout: FeedCardLayout
  liveBar: boolean
  wipe: boolean
  ticker: boolean
  frame: FeedCardFrame
  badge: FeedCardBadge
  panel: FeedCardPanel
  /** CSS color for accent / cursor / badge */
  accent: string
  /** Optional typewriter cadence hint (ms/char) — client may use */
  typeMs: number
  headlineClass: string
  summaryClass: string
}

const SKINS: Record<FeedCardSkinId, FeedCardSkin> = {
  'son-dakika': {
    id: 'son-dakika',
    layout: 'bottom',
    liveBar: true,
    wipe: false,
    ticker: false,
    frame: 'none',
    badge: 'solid',
    panel: 'dark',
    accent: '#e11d2e',
    typeMs: 20,
    headlineClass:
      'text-[1.38rem] font-black leading-[1.2] tracking-[-0.02em] text-white sm:text-[1.48rem]',
    summaryClass: 'text-[1rem] font-medium leading-[1.4] text-white/92 sm:text-[1.05rem]',
  },
  gundem: {
    id: 'gundem',
    layout: 'bottom',
    liveBar: false,
    wipe: false,
    ticker: false,
    frame: 'none',
    badge: 'solid',
    panel: 'dark',
    accent: '#e11d2e',
    typeMs: 26,
    headlineClass:
      'text-[1.36rem] font-extrabold leading-[1.22] tracking-[-0.02em] text-white sm:text-[1.45rem]',
    summaryClass: 'text-[1rem] font-medium leading-[1.4] text-white/92',
  },
  siyaset: {
    id: 'siyaset',
    layout: 'bottom',
    liveBar: false,
    wipe: false,
    ticker: false,
    frame: 'none',
    badge: 'ghost',
    panel: 'dark',
    accent: '#cbd5e1',
    typeMs: 28,
    headlineClass:
      'text-[1.32rem] font-extrabold leading-[1.25] tracking-[-0.015em] text-white sm:text-[1.4rem]',
    summaryClass: 'text-[0.95rem] font-medium leading-[1.4] text-white/88',
  },
  magazin: {
    id: 'magazin',
    layout: 'bottom',
    liveBar: false,
    wipe: false,
    ticker: false,
    frame: 'magazine',
    badge: 'ghost',
    panel: 'dark',
    accent: '#f4b460',
    typeMs: 34,
    headlineClass:
      'font-serif text-[1.45rem] font-normal italic leading-[1.22] tracking-[-0.01em] text-white sm:text-[1.55rem]',
    summaryClass: 'text-[0.95rem] font-medium leading-[1.4] text-white/90',
  },
  kultur: {
    id: 'kultur',
    layout: 'center',
    liveBar: false,
    wipe: false,
    ticker: false,
    frame: 'thin',
    badge: 'ghost',
    panel: 'dark',
    accent: '#e8c4a8',
    typeMs: 32,
    headlineClass:
      'font-serif text-[1.48rem] font-normal leading-[1.22] tracking-[-0.01em] text-white sm:text-[1.58rem]',
    summaryClass: 'text-[0.95rem] font-medium leading-[1.4] text-white/90',
  },
  spor: {
    id: 'spor',
    layout: 'bottom',
    liveBar: false,
    wipe: true,
    ticker: false,
    frame: 'none',
    badge: 'solid',
    panel: 'dark',
    accent: '#16a34a',
    typeMs: 16,
    headlineClass:
      'text-[1.55rem] font-black uppercase leading-[1.05] tracking-[0.02em] text-white sm:text-[1.7rem]',
    summaryClass: 'text-[0.95rem] font-medium leading-[1.35] text-white/90',
  },
  ekonomi: {
    id: 'ekonomi',
    layout: 'bottom',
    liveBar: false,
    wipe: false,
    ticker: true,
    frame: 'none',
    badge: 'solid',
    panel: 'dark',
    accent: '#3b82f6',
    typeMs: 24,
    headlineClass:
      'text-[1.32rem] font-bold leading-[1.22] tracking-[-0.01em] text-white sm:text-[1.4rem]',
    summaryClass: 'text-[0.95rem] font-medium leading-[1.4] text-white/90',
  },
  teknoloji: {
    id: 'teknoloji',
    layout: 'center',
    liveBar: false,
    wipe: false,
    ticker: false,
    frame: 'none',
    badge: 'solid',
    panel: 'dark',
    accent: '#22d3ee',
    typeMs: 26,
    headlineClass:
      'text-[1.38rem] font-bold leading-[1.2] tracking-[-0.025em] text-white sm:text-[1.48rem]',
    summaryClass: 'text-[0.95rem] font-medium leading-[1.4] text-white/90',
  },
  dunya: {
    id: 'dunya',
    layout: 'center',
    liveBar: false,
    wipe: false,
    ticker: false,
    frame: 'none',
    badge: 'ghost',
    panel: 'dark',
    accent: '#94a3b8',
    typeMs: 30,
    headlineClass:
      'text-[1.4rem] font-extrabold leading-[1.22] tracking-[-0.02em] text-white sm:text-[1.5rem]',
    summaryClass: 'text-[0.95rem] font-medium leading-[1.4] text-white/88',
  },
  saglik: {
    id: 'saglik',
    layout: 'center',
    liveBar: false,
    wipe: false,
    ticker: false,
    frame: 'thin',
    badge: 'solid',
    panel: 'dark',
    accent: '#2dd4bf',
    typeMs: 28,
    headlineClass:
      'text-[1.34rem] font-extrabold leading-[1.22] tracking-[-0.02em] text-white sm:text-[1.44rem]',
    summaryClass: 'text-[0.98rem] font-medium leading-[1.4] text-white/92',
  },
  yerel: {
    id: 'yerel',
    layout: 'bottom',
    liveBar: false,
    wipe: false,
    ticker: false,
    frame: 'none',
    badge: 'solid',
    panel: 'dark',
    accent: '#f59e0b',
    typeMs: 24,
    headlineClass:
      'text-[1.34rem] font-extrabold leading-[1.22] tracking-[-0.02em] text-white sm:text-[1.42rem]',
    summaryClass: 'text-[0.98rem] font-medium leading-[1.4] text-white/92',
  },
  gastronomi: {
    id: 'gastronomi',
    layout: 'center',
    liveBar: false,
    wipe: false,
    ticker: false,
    frame: 'magazine',
    badge: 'solid',
    panel: 'dark',
    accent: '#fb7185',
    typeMs: 33,
    headlineClass:
      'font-serif text-[1.48rem] font-normal italic leading-[1.22] tracking-[-0.01em] text-white sm:text-[1.58rem]',
    summaryClass: 'text-[0.95rem] font-medium leading-[1.4] text-white/90',
  },
  default: {
    id: 'default',
    layout: 'bottom',
    liveBar: false,
    wipe: false,
    ticker: false,
    frame: 'none',
    badge: 'solid',
    panel: 'dark',
    accent: '#e11d2e',
    typeMs: 26,
    headlineClass:
      'text-[1.36rem] font-extrabold leading-[1.22] tracking-[-0.02em] text-white sm:text-[1.45rem]',
    summaryClass: 'text-[1rem] font-medium leading-[1.4] text-white/92',
  },
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
