import { isVideoLibraryEnabled } from '@/video/featureFlag'
import { VideoLibraryAdminClient } from './VideoLibraryAdminClient'
import { VideoQueueAdminClient } from '@/components/admin/videos/VideoQueueAdminClient'

export const dynamic = 'force-dynamic'

export default function VideosAdminPage() {
  if (!isVideoLibraryEnabled()) {
    return <VideoQueueAdminClient />
  }
  return <VideoLibraryAdminClient />
}
