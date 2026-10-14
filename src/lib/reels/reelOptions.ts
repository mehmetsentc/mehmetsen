/**
 * REELS-4 — reel option types and pure helpers (no canvas import, safe for services/tests).
 */
/** Story style picked by the Reels AI editor (tag colour + default music). */
export type ReelStyle = 'haber' | 'magazin' | 'spor' | 'analiz'
/** Opening treatment. */
export type ReelIntro = 'soft' | 'slide' | 'minimal' | 'perde' | 'zoom'
/** Closing card. */
export type ReelOutro = 'logo' | 'follow' | 'short'
/** Theme music under the voice (assets/audio/broadcast/bed-<name>.m4a); auto = by story style. */
export type ReelMusic = 'sakin' | 'modern' | 'akustik' | 'kurumsal' | 'enerjik' | 'sondakika' | 'lofi' | 'none' | 'auto'
/** On-screen presenter card (persona name + optional photo; ring follows the voice). */
export type ReelPresenter = { name: string; title?: string | null; photo?: Buffer | null }

export const REEL_INTROS: ReelIntro[] = ['soft', 'slide', 'perde', 'zoom', 'minimal']
export const REEL_OUTROS: ReelOutro[] = ['logo', 'follow', 'short']
export const REEL_MUSIC: ReelMusic[] = ['auto', 'sakin', 'modern', 'akustik', 'kurumsal', 'enerjik', 'sondakika', 'lofi', 'none']
export const OUTRO_SECONDS: Record<ReelOutro, number> = { logo: 2.1, follow: 2.4, short: 1.3 }
const AUTO_MUSIC: Record<ReelStyle, Exclude<ReelMusic, 'auto' | 'none'>> = { haber: 'modern', spor: 'enerjik', magazin: 'akustik', analiz: 'sakin' }

/** Concrete bed file (or null for no music). */
export function resolveMusic(music: ReelMusic | undefined, style: ReelStyle, breaking = false): Exclude<ReelMusic, 'auto' | 'none'> | null {
  if (music === 'none') return null
  if (!music || music === 'auto') return breaking ? 'sondakika' : AUTO_MUSIC[style]
  return music
}

export function isReelIntro(v: unknown): v is ReelIntro {
  return typeof v === 'string' && (REEL_INTROS as string[]).includes(v)
}
export function isReelOutro(v: unknown): v is ReelOutro {
  return typeof v === 'string' && (REEL_OUTROS as string[]).includes(v)
}
export function isReelMusic(v: unknown): v is ReelMusic {
  return typeof v === 'string' && (REEL_MUSIC as string[]).includes(v)
}


export const INTRO_SECONDS: Record<ReelIntro, number> = { soft: 1.0, slide: 0.95, minimal: 0, perde: 1.1, zoom: 1.05 }
