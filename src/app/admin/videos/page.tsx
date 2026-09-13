import { isVideoLibraryEnabled } from '@/video/featureFlag'
import { VideoLibraryAdminClient } from './VideoLibraryAdminClient'
import { FirestoreVideoQueueClient } from './FirestoreVideoQueueClient'

export const dynamic = 'force-dynamic'

export default function VideosAdminPage() {
  if (isVideoLibraryEnabled()) return <VideoLibraryAdminClient />
  return <FirestoreVideoQueueClient />
}
