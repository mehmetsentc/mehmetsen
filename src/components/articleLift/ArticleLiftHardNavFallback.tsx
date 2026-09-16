'use client'

import { useEffect } from 'react'

/**
 * Escapes a failed Article Lift intercept without calling `notFound()`.
 * `notFound()` inside `@modal/(.)haber/[slug]` replaces the whole tree with
 * the global 404 — including cases where the canonical `/haber/[slug]` page
 * would have rendered fine on a hard navigation.
 */
export function ArticleLiftHardNavFallback({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href)
  }, [href])

  return (
    <div className="flex min-h-[40dvh] items-center justify-center px-4 text-sm text-text-tertiary">
      Haber açılıyor…
    </div>
  )
}
