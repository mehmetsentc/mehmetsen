'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { NewsletterSignup } from '@/components/newsletter/NewsletterSignup'

const STORAGE_KEY = 'nahaber-newsletter-prompt'
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000 // 14 gün
const SCROLL_THRESHOLD = 0.55

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw) as { dismissedAt?: number; subscribed?: boolean }
    if (data.subscribed) return true
    if (typeof data.dismissedAt === 'number' && Date.now() - data.dismissedAt < COOLDOWN_MS) {
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

function markDismissed(subscribed = false) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ dismissedAt: Date.now(), subscribed })
    )
  } catch {
    /* ignore */
  }
}

/**
 * Post-read newsletter modal — once per visitor, respectful 14-day cooldown.
 */
export function NewsletterPrompt() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (wasDismissedRecently()) return

    let shown = false
    const maybeShow = () => {
      if (shown) return
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - window.innerHeight
      if (scrollable <= 0) return
      const progress = window.scrollY / scrollable
      if (progress < SCROLL_THRESHOLD) return
      shown = true
      setOpen(true)
      window.removeEventListener('scroll', onScroll)
    }

    const onScroll = () => {
      maybeShow()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    const t = window.setTimeout(maybeShow, 8000)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(t)
    }
  }, [])

  if (!open) return null

  const close = (subscribed = false) => {
    markDismissed(subscribed)
    setOpen(false)
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pointer-events-none sm:bottom-6"
      role="dialog"
      aria-modal="true"
      aria-label="Haber bülteni"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
              Güncel haberler
            </p>
            <h2 className="mt-1 text-base font-bold text-[rgb(var(--color-text))]">
              Önemli gelişmeleri kaçırmayın
            </h2>
          </div>
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-lg p-1.5 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-nav-hover))] hover:text-[rgb(var(--color-text))]"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <NewsletterSignup
          source="article-prompt"
          variant="compact"
          title=""
          description="E-posta ile güncel haber özeti alın."
          onSuccess={() => close(true)}
        />
      </div>
    </div>
  )
}
