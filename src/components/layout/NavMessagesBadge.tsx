'use client'

import { memo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useConversations } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'

interface NavMessagesBadgeProps {
  className?: string
  size?: 'sm' | 'md'
}

function NavMessagesBadgeInner({ className, size = 'md' }: NavMessagesBadgeProps) {
  const { user } = useAuth()
  const { unreadTotal } = useConversations(user?.uid)

  if (!unreadTotal || unreadTotal <= 0) return null

  return (
    <span
      className={cn(
        'absolute flex items-center justify-center rounded-full bg-red-500 font-bold text-white',
        size === 'sm' && '-right-1 -top-1 h-3.5 min-w-3.5 px-0.5 text-[8px]',
        size === 'md' && '-right-1 -top-1 h-4 min-w-4 px-1 text-[9px]',
        className
      )}
    >
      {unreadTotal > 9 ? '9+' : unreadTotal}
    </span>
  )
}

export const NavMessagesBadge = memo(NavMessagesBadgeInner)
