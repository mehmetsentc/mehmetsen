import { createElement } from 'react'
import { Newspaper } from 'lucide-react'
import { toast as sonnerToast } from 'sonner'

export const FEED_NEW_POSTS_TOAST_ID = 'feed-new-posts'

/** Tema renklerine uygun — yeni haber bildirimi */
export function notifyFeedUpdated(count: number) {
  const message = count === 1 ? 'Yeni haber eklendi' : `${count} yeni haber eklendi`

  sonnerToast(message, {
    id: FEED_NEW_POSTS_TOAST_ID,
    duration: 4500,
    description: 'Akış güncellendi',
    icon: createElement(Newspaper, {
      className: 'h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]',
    }),
    classNames: {
      toast:
        'rounded-2xl border border-[rgb(var(--color-brand))]/35 bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow-lg pointer-events-auto',
      title: 'font-semibold text-[rgb(var(--color-brand))]',
      description: 'text-sm text-[rgb(var(--color-muted))]',
      closeButton:
        'pointer-events-auto z-20 text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
    },
  })
}

/** Canlı poll — yeni haberleri hızlı yakala (Firestore yükü makul) */
export const FEED_LIVE_POLL_MS =
  typeof window !== 'undefined' && window.innerWidth < 768 ? 45_000 : 30_000

/** İlk poll — LCP sonrası kısa gecikme */
export const FEED_LIVE_DEFER_MS = 8_000

export const FEED_BREAKING_POLL_MS = 30_000
