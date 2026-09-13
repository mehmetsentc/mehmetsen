import { VideoQueueAdminClient } from '@/components/admin/videos/VideoQueueAdminClient'
import { isVideoLibraryEnabled } from '@/video/featureFlag'

export const dynamic = 'force-dynamic'

export default function VideosQueueAdminPage() {
  return <VideoQueueAdminClient libraryEnabled={isVideoLibraryEnabled()} />
}
