import type { Metadata } from 'next'
import { VideoFeed } from '@/components/video/VideoFeed'

export const metadata: Metadata = { title: 'Video Akışı' }

export default function FeedPage() {
  return <VideoFeed />
}
