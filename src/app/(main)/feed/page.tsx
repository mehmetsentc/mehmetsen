import type { Metadata } from 'next'
import { FeedList } from '@/components/feed/FeedList'

export const metadata: Metadata = { title: 'Ana Akış' }

export default function FeedPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Ana Akış</h1>
      <FeedList />
    </div>
  )
}
