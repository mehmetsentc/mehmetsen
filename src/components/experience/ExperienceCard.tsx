'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ExperienceSlot } from './types'
import {
  AiSurface,
  BreakingSurface,
  LiveSurface,
  MediaBelow,
  MediaOverlay,
  QuoteSurface,
  QuickReadSurface,
  editorialKicker,
} from './CardChrome'
import { slotSizeClass } from './feedRhythm'
import { cn } from '@/lib/utils'

interface ExperienceCardProps {
  slot: ExperienceSlot
  priority?: boolean
}

function CardBody({ slot, priority }: ExperienceCardProps) {
  const { post, variant, aspect } = slot
  // Editorial kickers only — never layout names like "Magazin" / "Galeri"
  const kicker = editorialKicker(variant)

  switch (variant) {
    case 'hero':
      return (
        <MediaOverlay
          post={post}
          aspect="16/9"
          priority={priority}
          showSummary
          titleClassName="exp-card__title--hero"
        />
      )
    case 'breaking':
      return <BreakingSurface post={post} aspect={aspect} />
    case 'live':
      return <LiveSurface post={post} aspect={aspect} />
    case 'video':
      return (
        <MediaOverlay
          post={post}
          aspect="16/9"
          titleClassName="text-base sm:text-lg"
        />
      )
    case 'quote':
    case 'opinion':
      return <QuoteSurface post={post} />
    case 'aiSummary':
      return <AiSurface post={post} />
    case 'quickRead':
    case 'small':
      return <QuickReadSurface post={post} />
    case 'photoStory':
    case 'magazine':
      return (
        <MediaOverlay
          post={post}
          aspect="3/2"
          showSummary={variant === 'magazine'}
          titleClassName="text-lg sm:text-xl"
        />
      )
    case 'gallery':
      return (
        <MediaBelow
          post={post}
          aspect="3/2"
          showSummary={false}
          titleClassName="text-base sm:text-lg"
        />
      )
    case 'large':
      return (
        <MediaBelow
          post={post}
          aspect="16/9"
          priority={priority}
          kicker={kicker}
          titleClassName="text-xl sm:text-2xl"
        />
      )
    case 'trending':
    case 'popular':
    case 'recommended':
    case 'podcast':
    case 'timeline':
    case 'map':
    case 'medium':
    default:
      return (
        <MediaBelow
          post={post}
          aspect={aspect === '9/16' || aspect === '4/5' || aspect === '1/1' ? '3/2' : aspect}
          kicker={kicker}
          showSummary={variant !== 'medium'}
          titleClassName="text-[1.05rem] sm:text-lg"
        />
      )
  }
}

export function ExperienceCard({ slot, priority = false }: ExperienceCardProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={cn(slotSizeClass(slot.size), 'exp-card-shell')}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      <CardBody slot={slot} priority={priority} />
    </motion.div>
  )
}
