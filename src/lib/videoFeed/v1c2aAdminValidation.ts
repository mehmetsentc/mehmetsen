import { isYouTubeUrl } from '@/lib/postUtils'
import {
  hasPlayableVisualVideo,
  isPlayableOwnedNativeUrl,
} from '@/lib/videoFeed/playableVisual'
import { selectOwnedNativePlayback } from '@/lib/videoFeed/ownedNativePlayback'
import type { VideoFeedItem } from '@/hooks/useVideoFeed'

/** Temporary admin-only route. Not a product surface. Remove after human PASS. */
export const V1C2A_ADMIN_VALIDATION_PATH = '/admin/v1c2a-native-validation'

export const V1C2A_ADMIN_ASSET_A =
  'https://firebasestorage.googleapis.com/v0/b/nahaberapp.firebasestorage.app/o/news-videos%2Fadmin%2F1784742038648_imported.mp4?alt=media'

export const V1C2A_ADMIN_ASSET_B =
  'https://firebasestorage.googleapis.com/v0/b/nahaberapp.firebasestorage.app/o/news-videos%2Fadmin%2F1785019317375_imported.mp4?alt=media'

const EPOCH = '1970-01-01T00:00:00.000Z'

export type V1C2AAdminValidationItem = VideoFeedItem & {
  videoUrl: string
  videoEmbedUrl?: string | null
}

function makeItem(
  id: string,
  title: string,
  url: string
): V1C2AAdminValidationItem {
  return {
    id,
    title,
    slug: id,
    content: '',
    summary: 'Admin validation only — no analytics writes',
    authorId: 'v1c2a-admin',
    authorUsername: 'v1c2a-admin',
    authorDisplayName: 'V1C.2A',
    authorPhotoURL: null,
    categoryId: 'gundem',
    tags: [],
    mediaItems: [{ type: 'video', url, thumbnailUrl: null, caption: null }],
    coverImageUrl: null,
    status: 'draft',
    visibility: 'private',
    postType: 'video',
    source: '',
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    isEditorPick: false,
    isTrending: false,
    publishedAt: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    videoUrl: url,
  }
}

/**
 * Three in-memory slides (A, B, A) so rapid double-swipe can exercise stale
 * next-preload abort without duplicating Storage objects.
 */
export function buildV1C2AAdminValidationItems(): V1C2AAdminValidationItem[] {
  return [
    makeItem('v1c2a-admin-1', 'V1C.2A Validation 1', V1C2A_ADMIN_ASSET_A),
    makeItem('v1c2a-admin-2', 'V1C.2A Validation 2', V1C2A_ADMIN_ASSET_B),
    makeItem('v1c2a-admin-3', 'V1C.2A Validation 3', V1C2A_ADMIN_ASSET_A),
  ]
}

export function v1c2aAdminValidationNoopUpdate(): void {
  // Validation surface must not write views/likes/saves/shares/comments.
}

export function isV1C2AAdminValidationOwnedNativeItem(
  item: V1C2AAdminValidationItem
): boolean {
  const owned = selectOwnedNativePlayback(item)
  if (owned.status === 'none') return false
  if (!isPlayableOwnedNativeUrl(owned.url)) return false
  if (!hasPlayableVisualVideo(item)) return false
  if (isYouTubeUrl(item.videoUrl) || isYouTubeUrl(item.mediaItems[0]?.url)) return false
  if (item.videoEmbedUrl) return false
  return true
}
