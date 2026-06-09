import type { Metadata } from 'next'
import { ReelsLoader } from '@/components/video/ReelsLoader'

export const metadata: Metadata = {
  title: 'Teve',
  description: 'Kısa video haberler',
}

export default function ReelsPage() {
  return <ReelsLoader />
}
