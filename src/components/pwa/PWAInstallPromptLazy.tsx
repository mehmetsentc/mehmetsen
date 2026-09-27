'use client'

import dynamic from 'next/dynamic'

/** Keeps framer-motion out of the first homepage script. */
export const PWAInstallPromptLazy = dynamic(
  () => import('./PWAInstallPrompt').then((m) => m.PWAInstallPrompt),
  { ssr: false }
)
