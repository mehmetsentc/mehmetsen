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
  variantLabel,
  CardBadge,
} from './CardChrome'
import { slotSizeClass } from './feedRhythm'
import { cn } from '@/lib/utils'

interface ExperienceCardProps {
  slot: ExperienceSlot
  priority?: boolean
}

function CardBody({ slot, priority }: ExperienceCardProps) {
  const { post, variant, aspect } = slot
  const kicker = variantLabel(variant)

  switch (variant) {
    case 'hero':
      return (
        <MediaOverlay
          post={post}
          aspect="16/9"
          priority={priority}
          showSummary
          titleClassName="text-[1.35rem] sm:text-2xl lg:text-3xl"
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
          aspect="9/16"
          badge={kicker ? <CardBadge>{kicker}</CardBadge> : undefined}
          titleClassName="text-base"
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
          aspect="4/5"
          badge={kicker ? <CardBadge>{kicker}</CardBadge> : undefined}
          showSummary={variant === 'magazine'}
          titleClassName="text-lg sm:text-xl"
        />
      )
    case 'gallery':
      return (
        <MediaBelow
          post={post}
          aspect="1/1"
          kicker={kicker}
          showSummary={false}
          titleClassName="text-base"
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
          aspect={aspect}
          kicker={kicker}
          showSummary={variant !== 'medium'}
          titleClassName="text-[1.05rem]"
        />
      )
  }
}

export function ExperienceCard({ slot, priority = false }: ExperienceCardProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={cn(slotSizeClass(slot.size), 'exp-card-shell')}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <CardBody slot={slot} priority={priority} />
    </motion.div>
  )
}
