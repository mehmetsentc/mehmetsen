'use client'

import { useEffect, useState } from 'react'

export function useStudioReveal(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 240)
    return () => window.clearTimeout(timer)
  }, [])
  return ready
}
