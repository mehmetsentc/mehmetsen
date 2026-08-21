'use client'

import { useEffect } from 'react'
import { isAndroidNative, isIOSNative, isNativeApp } from '@/lib/platform'

/**
 * Re-assert data-native-shell after hydration in case Capacitor bridge
 * was not ready during the beforeInteractive PlatformScript.
 * Web / PWA: clears the attribute so native-only CSS never applies.
 */
export function NativeShellMark() {
  useEffect(() => {
    const root = document.documentElement
    if (!isNativeApp()) {
      delete root.dataset.nativeShell
      return
    }
    if (isIOSNative()) {
      root.dataset.nativeShell = 'ios'
      return
    }
    if (isAndroidNative()) {
      root.dataset.nativeShell = 'android'
      return
    }
    root.dataset.nativeShell = 'native'
  }, [])

  return null
}
