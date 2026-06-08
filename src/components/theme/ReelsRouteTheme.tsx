'use client'

import { useEffect, useRef } from 'react'
import { applyThemeClass, getStoredTheme, resolveTheme } from '@/lib/theme'

interface ReelsRouteThemeProps {
  active: boolean
}

/** Reels sayfasında koyu mod; çıkınca kullanıcı tercihine döner. */
export function ReelsRouteTheme({ active }: ReelsRouteThemeProps) {
  const wasActiveRef = useRef(false)

  useEffect(() => {
    if (active) {
      wasActiveRef.current = true
      applyThemeClass('dark')
      return
    }

    if (wasActiveRef.current) {
      wasActiveRef.current = false
      applyThemeClass(resolveTheme(getStoredTheme()))
    }
  }, [active])

  return null
}
