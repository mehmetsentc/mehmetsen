'use client'

import { RefreshCcw } from 'lucide-react'

export function OfflineRetryButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined') window.location.reload()
      }}
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-card px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-subtle"
    >
      <RefreshCcw className="h-4 w-4" />
      Yeniden dene
    </button>
  )
}
