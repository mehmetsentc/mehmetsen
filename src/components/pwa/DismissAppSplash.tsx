'use client'

import { useEffect } from 'react'

/** Removes the launch logo once the app has hydrated. */
export function DismissAppSplash() {
  useEffect(() => {
    document.getElementById('app-splash')?.remove()
  }, [])
  return null
}
