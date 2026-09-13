import { hasVideoContent } from '@/lib/postUtils'
import type { Post } from '@/types/post'
import {
  pickVisualVideoRepresentative,
  suppressClusterDuplicates,
} from '@/lib/videoFeed/dedupVisualVideos'
import { hasPlayableVisualVideo } from '@/lib/videoFeed/playableVisual'
import type { VideoFeedSurface } from '@/lib/videoFeed/types'

export function shouldUseTtsVideoFallback(
  surface: VideoFeedSurface,
  newsPostCount: number,
  hasCursor: boolean
): boolean {
  if (surface === 'video') return false
  return newsPostCount === 0 && !hasCursor
}

export function finalizeVideoFeedPosts(
  posts: Post[],
  surface: VideoFeedSurface
): Post[] {
  if (surface === 'video') {
    const visual = pickVisualVideoRepresentative(
      posts.filter((post) => hasPlayableVisualVideo(post))
    )
    return suppressClusterDuplicates(visual).posts
  }
  return posts.filter(hasVideoContent)
}
