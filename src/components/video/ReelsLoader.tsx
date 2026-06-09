'use client'

import dynamic from 'next/dynamic'

const ReelsPageClient = dynamic(
  () => import('@/components/video/ReelsPageClient').then(m => ({ default: m.ReelsPageClient })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    ),
  }
)

export function ReelsLoader() {
  return <ReelsPageClient />
}
