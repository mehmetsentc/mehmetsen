'use client'

import { useEffect, useState } from 'react'

const READER_OPEN_CLASS = 'smart-feed-reader-open'

function readReaderSurfaceActive(): boolean {
  if (typeof document === 'undefined') return false
  return (
    document.documentElement.classList.contains(READER_OPEN_CLASS) ||
    document.body.classList.contains(READER_OPEN_CLASS)
  )
}

/**
 * Mirrors FeedArticleReader's smart-feed-reader-open class for layout chrome.
 * Active for OPEN / OPENING / CLOSING; clears only after close UI finishes.
 */
export function useSmartFeedReaderSurfaceActive(): boolean {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const sync = () => setActive(readReaderSurfaceActive())
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  return active
}
