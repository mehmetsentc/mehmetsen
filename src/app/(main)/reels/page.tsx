import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

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

export const metadata: Metadata = {
  title: 'Teve',
  description: 'Kısa video haberler',
}

export default function ReelsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    }>
      <ReelsPageClient />
    </Suspense>
  )
}
