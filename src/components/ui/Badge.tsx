import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'breaking' | 'category' | 'trending'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'pill',
        variant === 'breaking' && 'bg-red-100 text-red-700',
        variant === 'category' && 'bg-blue-50 text-blue-700',
        variant === 'trending' && 'bg-purple-100 text-purple-700',
        variant === 'default' && 'bg-gray-100 text-gray-700',
        className
      )}
    >
      {children}
    </span>
  )
}
