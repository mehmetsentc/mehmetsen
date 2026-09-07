'use client'

import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  captureFeedV2EntryFromReferrer,
  resolveFeedV2ExitHref,
} from '@/lib/feed/reader/feedV2Exit'

interface FeedV2ExitButtonProps {
  className?: string
  /** When Reader owns the surface, hide Level-2 exit (Level-3 owns Back). */
  hidden?: boolean
}

/**
 * Feed V2 → previous NaHaber surface (Level 2 → Level 1).
 * Explicit router.push only — never blind browser history back.
 */
export function FeedV2ExitButton({ className, hidden = false }: FeedV2ExitButtonProps) {
  const router = useRouter()

  useEffect(() => {
    captureFeedV2EntryFromReferrer()
  }, [])

  const onClick = useCallback(() => {
    const href = resolveFeedV2ExitHref()
    router.push(href)
  }, [router])

  if (hidden) return null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Akıştan çık"
      title="Geri"
      data-testid="smart-feed-exit-nav"
      data-feed-exit="1"
      className={cn(
        'back-nav-btn back-nav-btn--dark shrink-0',
        'inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center',
        className
      )}
    >
      <ArrowLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
    </button>
  )
}
