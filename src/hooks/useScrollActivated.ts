'use client'

import { useEffect, useState } from 'react'

/** Kullanıcı sayfayı kaydırmadan Firestore sorgusu gönderilmesin. */
export function useScrollActivated() {
  const [activated, setActivated] = useState(false)

  useEffect(() => {
    if (activated) return

    const activate = () => setActivated(true)

    const opts: AddEventListenerOptions = { passive: true, once: true }
    window.addEventListener('scroll', activate, opts)
    window.addEventListener('wheel', activate, opts)
    window.addEventListener('touchmove', activate, opts)
    window.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'End', 'Space'].includes(e.key)) {
        activate()
      }
    }, { once: true })

    return () => {
      window.removeEventListener('scroll', activate)
      window.removeEventListener('wheel', activate)
      window.removeEventListener('touchmove', activate)
    }
  }, [activated])

  return activated
}
