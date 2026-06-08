import type { Metadata } from 'next'
import { ReelsPageClient } from '@/components/video/ReelsPageClient'

export const metadata: Metadata = {
  title: 'Teve',
  description: 'Kısa video haberler',
}

export default function ReelsPage() {
  return <ReelsPageClient />
}
