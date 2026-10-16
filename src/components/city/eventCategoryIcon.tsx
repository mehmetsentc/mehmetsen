import {
  Clapperboard,
  Drama,
  Frame,
  Music,
  PartyPopper,
  Sparkles,
  Tent,
  type LucideIcon,
} from 'lucide-react'
import type { EventCategory } from '@/types/event'

export const EVENT_CATEGORY_ICON: Record<EventCategory, LucideIcon> = {
  concert: Music,
  festival: Tent,
  party: PartyPopper,
  exhibition: Frame,
  theater: Drama,
  cinema: Clapperboard,
  other: Sparkles,
}

export function EventCategoryIcon({ category, className }: { category: EventCategory; className?: string }) {
  const Icon = EVENT_CATEGORY_ICON[category] ?? Sparkles
  return <Icon className={className} aria-hidden />
}
