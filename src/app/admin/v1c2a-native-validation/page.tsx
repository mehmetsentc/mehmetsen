import type { Metadata } from 'next'
import { V1C2ANativeValidationClient } from '@/components/video/V1C2ANativeValidationClient'

export const metadata: Metadata = {
  title: 'V1C.2A Native Playback Validation',
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
}

export default function V1C2ANativeValidationPage() {
  return <V1C2ANativeValidationClient />
}
