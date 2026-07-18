import { hasVideoContent } from '@/lib/postUtils'
import { shouldShowBreakingBadge } from '@/lib/newsBreaking'
import type { TimelinePost } from '@/types/post'
import type { AspectRatio, CardVariant, ExperienceSlot, SlotSize } from './types'

/**
 * Repeating 12-slot design rhythms. Consecutive cycles never reuse the same
 * sequence so a long scroll never feels like a loop.
 */
const RHYTHM_CYCLES: CardVariant[][] = [
  [
    'hero',
    'medium',
    'small',
    'video',
    'magazine',
    'quickRead',
    'gallery',
    'trending',
    'large',
    'quote',
    'photoStory',
    'recommended',
  ],
  [
    'breaking',
    'large',
    'small',
    'small',
    'video',
    'aiSummary',
    'magazine',
    'medium',
    'gallery',
    'popular',
    'timeline',
    'quickRead',
  ],
  [
    'photoStory',
    'trending',
    'medium',
    'video',
    'quote',
    'large',
    'small',
    'magazine',
    'live',
    'recommended',
    'gallery',
    'opinion',
  ],
  [
    'hero',
    'gallery',
    'quickRead',
    'trending',
    'large',
    'small',
    'video',
    'aiSummary',
    'magazine',
    'medium',
    'photoStory',
    'popular',
  ],
]

const SIZE_BY_VARIANT: Record<CardVariant, SlotSize> = {
  hero: 'xl',
  breaking: 'lg',
  video: 'lg',
  live: 'lg',
  timeline: 'md',
  opinion: 'md',
  gallery: 'lg',
  photoStory: 'xl',
  aiSummary: 'md',
  podcast: 'md',
  map: 'lg',
  trending: 'md',
  magazine: 'lg',
  quickRead: 'sm',
  popular: 'md',
  recommended: 'md',
  large: 'lg',
  medium: 'md',
  small: 'sm',
  quote: 'md',
}

const ASPECT_BY_VARIANT: Record<CardVariant, AspectRatio> = {
  hero: '16/9',
  breaking: '16/9',
  video: '9/16',
  live: '16/9',
  timeline: '3/2',
  opinion: '4/5',
  gallery: '1/1',
  photoStory: '4/5',
  aiSummary: '3/2',
  podcast: '1/1',
  map: '16/9',
  trending: '3/2',
  magazine: '4/5',
  quickRead: '1/1',
  popular: '3/2',
  recommended: '3/2',
  large: '16/9',
  medium: '3/2',
  small: '1/1',
  quote: '4/5',
}

function preferVariant(post: TimelinePost, suggested: CardVariant): CardVariant {
  if (shouldShowBreakingBadge(post) || post.isBreaking) return 'breaking'
  if (post.isLiveBlog) return 'live'
  if (hasVideoContent(post)) return suggested === 'hero' ? 'hero' : 'video'
  if ((post.mediaItems?.filter((m) => m.type === 'image').length ?? 0) >= 3) {
    return suggested === 'hero' || suggested === 'photoStory' ? suggested : 'gallery'
  }
  if (post.audioReady || post.audioUrl) return 'podcast'
  if (post.isEditorPick) return suggested === 'hero' ? 'hero' : 'recommended'
  if (post.isTrending || post.editorType === 'trend') {
    return suggested === 'hero' ? 'hero' : 'trending'
  }
  if (post.spot && suggested === 'medium') return 'aiSummary'
  return suggested
}

/** Avoid stacking identical variants back-to-back. */
function diversify(prev: CardVariant | null, next: CardVariant): CardVariant {
  if (!prev || prev !== next) return next
  const fallback: CardVariant[] = ['medium', 'small', 'quickRead', 'magazine', 'quote', 'large']
  return fallback.find((v) => v !== next) ?? 'medium'
}

export function buildExperienceSlots(posts: TimelinePost[]): ExperienceSlot[] {
  const slots: ExperienceSlot[] = []
  let previous: CardVariant | null = null

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]!
    const cycle = RHYTHM_CYCLES[Math.floor(i / 12) % RHYTHM_CYCLES.length]!
    const rhythmIndex = i % 12
    const suggested = cycle[rhythmIndex]!
    const preferred = preferVariant(post, suggested)
    const variant = diversify(previous, preferred)
    previous = variant

    slots.push({
      post,
      variant,
      size: SIZE_BY_VARIANT[variant],
      aspect: ASPECT_BY_VARIANT[variant],
      index: i,
      rhythmIndex,
    })
  }

  return slots
}

export function slotSizeClass(size: SlotSize): string {
  switch (size) {
    case 'xl':
      return 'exp-slot exp-slot--xl'
    case 'lg':
      return 'exp-slot exp-slot--lg'
    case 'md':
      return 'exp-slot exp-slot--md'
    case 'sm':
    default:
      return 'exp-slot exp-slot--sm'
  }
}
