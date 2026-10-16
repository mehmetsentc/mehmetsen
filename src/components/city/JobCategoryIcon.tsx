import {
  Briefcase,
  Calculator,
  Cpu,
  Factory,
  GraduationCap,
  HardHat,
  ShieldCheck,
  ShoppingBag,
  SprayCan,
  Stethoscope,
  Truck,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { JobCategoryId } from '@/lib/cityJobFilters'
import { cn } from '@/lib/utils'

/** Profession icon + a calm tint per category (replaces the initials avatar). */
const TONE: Record<JobCategoryId, { Icon: LucideIcon; bg: string; fg: string }> = {
  sales: { Icon: ShoppingBag, bg: '#fde7ef', fg: '#be185d' },
  driver: { Icon: Truck, bg: '#e0f2fe', fg: '#0369a1' },
  production: { Icon: Factory, bg: '#ede9fe', fg: '#6d28d9' },
  construction: { Icon: HardHat, bg: '#fef3c7', fg: '#b45309' },
  hospitality: { Icon: UtensilsCrossed, bg: '#ffedd5', fg: '#c2410c' },
  office: { Icon: Calculator, bg: '#e0e7ff', fg: '#4338ca' },
  health: { Icon: Stethoscope, bg: '#dcfce7', fg: '#15803d' },
  education: { Icon: GraduationCap, bg: '#fce7f3', fg: '#a21caf' },
  security: { Icon: ShieldCheck, bg: '#e2e8f0', fg: '#334155' },
  it: { Icon: Cpu, bg: '#cffafe', fg: '#0e7490' },
  service: { Icon: SprayCan, bg: '#ccfbf1', fg: '#0f766e' },
  other: { Icon: Briefcase, bg: '#f1f5f9', fg: '#475569' },
}

export function JobCategoryIcon({
  category,
  size = 48,
  className,
}: {
  category: JobCategoryId
  size?: number
  className?: string
}) {
  const t = TONE[category] ?? TONE.other
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-xl', className)}
      style={{ width: size, height: size, background: t.bg, color: t.fg }}
      aria-hidden
    >
      <t.Icon style={{ width: size * 0.48, height: size * 0.48 }} strokeWidth={2.1} />
    </span>
  )
}
