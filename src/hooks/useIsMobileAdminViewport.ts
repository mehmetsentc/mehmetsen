'use client'

import { useEffect, useState } from 'react'

/** True when viewport is below Tailwind `md` (768px) — mobile admin shell. */
export function useIsMobileAdminViewport() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return isMobile
}
