'use client'

import { useEffect, useState } from 'react'

/** NYT tarzı kompakt header — scrollY eşiğini geçince true */
export function useScrollCompact(threshold = 120): boolean {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const onScroll = () => setCompact((window.scrollY || 0) > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return compact
}
