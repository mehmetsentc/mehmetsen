'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildPostShareUrl } from '@/lib/shareUtils'
import { ShareMenu } from '@/components/post/ShareMenu'

interface ShareButtonProps {
  postId: string
  /** Canonical slug for `/haber/[slug]` share URLs when available. */
  slug?: string
  title: string
  /** Optional body excerpt; combined with title for copy / native / social share text. */
  text?: string
  variant?: 'default' | 'overlay' | 'inline' | 'reels'
  onShared?: () => void
}

export function ShareButton({
  postId,
  slug,
  title,
  text,
  variant = 'overlay',
  onShared,
}: ShareButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isOverlay = variant === 'overlay'
  const isInline = variant === 'inline'
  const isReels = variant === 'reels'

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(true)
  }

  const shareUrl = buildPostShareUrl(slug ? { id: postId, slug } : postId)

  return (
    <>
      <button
        type="button"
        onClick={handleShare}
        aria-label="Paylaş"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        className={cn(
          'transition-transform active:scale-90',
          isInline && 'timeline-action',
          !isInline && 'flex flex-col items-center gap-1',
          isReels || isOverlay
            ? 'text-white'
            : !isInline && 'text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400'
        )}
      >
        {isInline ? (
          <>
            <Share2 className="h-4 w-4" />
            <span>Paylaş</span>
          </>
        ) : isReels ? (
          <Share2 className="h-7 w-7" />
        ) : (
          <>
            <span
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-sm',
                isOverlay ? 'bg-black/30' : 'bg-gray-100 dark:bg-gray-800'
              )}
            >
              <Share2 className="h-6 w-6" />
            </span>
            <span
              className={cn(
                'text-xs font-semibold',
                isOverlay ? 'text-white drop-shadow' : 'text-gray-600 dark:text-gray-400'
              )}
            >
              Paylaş
            </span>
          </>
        )}
      </button>

      <ShareMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={title}
        text={text}
        url={shareUrl}
        postId={postId}
        onShared={onShared}
      />
    </>
  )
}
