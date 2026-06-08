import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  description?: string
  accent?: 'red' | 'blue' | 'green' | 'amber'
}

const accentStyles = {
  red: 'bg-red-500/10 text-red-500',
  blue: 'bg-blue-500/10 text-blue-500',
  green: 'bg-emerald-500/10 text-emerald-500',
  amber: 'bg-amber-500/10 text-amber-500',
}

export function StatsCard({ title, value, icon: Icon, description, accent = 'red' }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-[rgb(var(--color-muted))]">{title}</p>
          <p className="mt-1 text-3xl font-bold text-[rgb(var(--color-text))]">{value}</p>
          {description && (
            <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">{description}</p>
          )}
        </div>
        <div className={cn('rounded-lg p-2.5', accentStyles[accent])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}
