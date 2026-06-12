'use client'

import { useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { usePageStateStore } from '@/store/pageStateStore'

/**
 * Per-page client state keyed by current pathname + arbitrary key.
 * Survives client-side navigation and tab reload (sessionStorage).
 */
export function usePageState<T>(key: string, defaultValue: T) {
  const pathname = usePathname()
  const stored = usePageStateStore((s) => s.pages[pathname]?.values[key] as T | undefined)
  const setValue = usePageStateStore((s) => s.setValue)

  const setState = useCallback(
    (next: T | ((prev: T) => T)) => {
      const current =
        (usePageStateStore.getState().pages[pathname]?.values[key] as T | undefined) ??
        defaultValue
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(current) : next
      setValue(pathname, key, resolved)
    },
    [pathname, key, defaultValue, setValue]
  )

  return [stored ?? defaultValue, setState] as const
}
