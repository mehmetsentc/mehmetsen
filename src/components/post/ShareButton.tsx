'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants/routes'

interface ShareButtonProps {
  postId: string
  title: string
  variant?: 'default' | 'overlay'
}

export function ShareButton({ postId, title, variant = 'overlay' }: ShareButtonProps) {
  const [sharing, setSharing] = useState(false)
  const isOverlay = variant === 'overlay'
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}${ROUTES.POST_DETAIL(postId)}`
    : ROUTES.POST_DETAIL(postId)

  const handleShare = async () => {
    if (sharing) return
    setSharing(true)

    try {
      if (navigator.share) {
        await navigator.share({ title, text: title, url })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success('Bağlantı kopyalandı')
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error('Paylaşım başarısız oldu')
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={sharing}
      aria-label="Paylaş"
      className={cn(
        'flex flex-col items-center gap-1 transition-transform active:scale-90 disabled:opacity-60',
        isOverlay ? 'text-white' : 'text-gray-500 hover:text-blue-500'
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-sm',
          isOverlay ? 'bg-black/30' : 'bg-gray-100'
        )}
      >
        <Share2 className="h-6 w-6" />
      </span>
      <span className={cn('text-xs font-semibold', isOverlay ? 'text-white drop-shadow' : '')}>
        Paylaş
      </span>
    </button>
  )
}
