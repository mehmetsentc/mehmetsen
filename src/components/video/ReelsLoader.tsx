'use client'

import dynamic from 'next/dynamic'

const ReelsPageClient = dynamic(
  () => import('@/components/video/ReelsPageClient').then((m) => ({ default: m.ReelsPageClient })),
  {
    ssr: false,
    loading: () => null, // SSR shell zaten min-height rezerve ediyor
  }
)

export function ReelsLoader() {
  return <ReelsPageClient />
}
