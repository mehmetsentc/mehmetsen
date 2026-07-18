import type { TimelinePost } from '@/types/post'

/** Visual role assigned to a post inside the rhythmic feed. */
export type CardVariant =
  | 'hero'
  | 'breaking'
  | 'video'
  | 'live'
  | 'timeline'
  | 'opinion'
  | 'gallery'
  | 'photoStory'
  | 'aiSummary'
  | 'podcast'
  | 'map'
  | 'trending'
  | 'magazine'
  | 'quickRead'
  | 'popular'
  | 'recommended'
  | 'large'
  | 'medium'
  | 'small'
  | 'quote'

/** Masonry / board slot footprint. */
export type SlotSize = 'sm' | 'md' | 'lg' | 'xl'

export type AspectRatio = '1/1' | '4/5' | '16/9' | '9/16' | '3/2' | '21/9'

export type ExperienceBreakpoint = 'mobile' | 'tablet' | 'desktop'

export interface ExperienceSlot {
  post: TimelinePost
  variant: CardVariant
  size: SlotSize
  aspect: AspectRatio
  index: number
  /** Block index inside the repeating 12-item rhythm. */
  rhythmIndex: number
}

export interface ExperienceTheme {
  id: string
  accent: string
  accentRgb: string
  kicker: string
  mood: 'minimal' | 'global' | 'sport' | 'tech' | 'magazine' | 'calm' | 'science' | 'travel' | 'local'
  /** CSS surface tint for the category shell. */
  surfaceTint: string
  titleWeight: 600 | 700 | 800 | 900
  cardRadius: 'sharp' | 'soft' | 'round'
}
