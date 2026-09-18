'use client'

import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useFollow } from '@/hooks/useFollow'
import { cn } from '@/lib/utils'

export function EditorFollowButton({
  authorUid,
  className,
}: {
  authorUid: string
  className?: string
}) {
  const { user } = useAuth()
  const { following, loading, toggle } = useFollow(user?.uid, authorUid, false)

  if (!authorUid) return null

  return (
    <div className={cn('inline-flex items-center', className)} data-testid="smart-feed-editor-follow">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={loading}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-60',
          following
            ? 'border border-white/45 bg-black/70 text-white'
            : 'border-[1.5px] border-[rgb(var(--color-brand))] bg-black/70 text-white hover:bg-[rgb(var(--color-brand))]/25'
        )}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <span aria-hidden>+</span>}
        {following ? 'Takiptesin' : 'Takip et'}
      </button>
    </div>
  )
}
