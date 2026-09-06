/** Feed Reader V2 — dark-first editorial visual tokens (scoped). */

export const FEED_READER_CSS_VARS = {
  '--reader-page-bg': '#0c0c0e',
  '--reader-page-elevated': '#141417',
  '--reader-page-text': '#f4f1ea',
  '--reader-page-muted': '#a8a29a',
  '--reader-page-edge': 'rgba(255,255,255,0.10)',
  '--reader-fold-shadow': 'rgba(0,0,0,0.55)',
  /** Existing NaHaber brand red from feedCardSkins */
  '--reader-accent': '#e11d2e',
  '--reader-duration': '320ms',
  '--reader-body-size': '1.125rem',
  '--reader-body-leading': '1.66',
} as const

export const FEED_READER_DURATION_MS = 320

/** Bounded hero load before FAILED_MEDIA (ms). */
export const FEED_READER_HERO_LOAD_TIMEOUT_MS = 4500
