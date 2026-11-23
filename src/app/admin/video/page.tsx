'use client'

import { Suspense } from 'react'
import { VideoCenter } from '@/components/admin/video/VideoCenter'

export default function VideoCenterPage() {
  return (
    <Suspense fallback={null}>
      <VideoCenter />
    </Suspense>
  )
}
