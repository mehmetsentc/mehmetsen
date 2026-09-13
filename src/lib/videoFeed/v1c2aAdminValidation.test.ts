import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isYouTubeUrl, getPrimaryVideo } from '@/lib/postUtils'
import { isPlayableOwnedNativeUrl } from '@/lib/videoFeed/playableVisual'
import { selectOwnedNativePlayback } from '@/lib/videoFeed/ownedNativePlayback'
import { nativePreloadRoleFor } from '@/lib/videoFeed/nativePreloadPolicy'
import {
  V1C2A_ADMIN_ASSET_A,
  V1C2A_ADMIN_ASSET_B,
  V1C2A_ADMIN_VALIDATION_PATH,
  buildV1C2AAdminValidationItems,
  isV1C2AAdminValidationOwnedNativeItem,
  v1c2aAdminValidationNoopUpdate,
} from '@/lib/videoFeed/v1c2aAdminValidation'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('V1C.2A admin validation surface', () => {
  it('lives under the admin-only route and is noindex', () => {
    expect(V1C2A_ADMIN_VALIDATION_PATH).toBe('/admin/v1c2a-native-validation')
    const page = read('src/app/admin/v1c2a-native-validation/page.tsx')
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false/)
    expect(page).toContain('V1C2ANativeValidationClient')
    expect(page).not.toContain('postService')
    expect(page).not.toContain('useVideoFeed')
    const robots = read('src/app/robots.ts')
    expect(robots).toContain("'/admin/'")
    const middleware = read('middleware.ts')
    expect(middleware).toContain("pathname.startsWith('/admin')")
    const layout = read('src/app/admin/layout.tsx')
    expect(layout).toContain('AdminGuard')
  })

  it('does not query the public video feed or persist items', () => {
    const client = read('src/components/video/V1C2ANativeValidationClient.tsx')
    expect(client).not.toContain('useVideoFeed')
    expect(client).not.toContain('postService')
    expect(client).not.toContain('getVideoFeed')
    expect(client).not.toContain('likeService')
    expect(client).not.toContain('saveService')
    expect(client).not.toContain('socialApi')
    expect(client).not.toContain('markReelSeen')
    expect(client).not.toContain('incrementViews')
    expect(client).toContain('buildV1C2AAdminValidationItems')
    expect(client).toContain('v1c2aAdminValidationNoopUpdate')
    const lib = read('src/lib/videoFeed/v1c2aAdminValidation.ts')
    expect(lib).not.toContain('getFirestore')
    expect(lib).not.toContain('addDoc')
    expect(lib).not.toContain('updateDoc')
  })

  it('validation URLs pass the owned-native gate and do not select YouTube', () => {
    const items = buildV1C2AAdminValidationItems()
    expect(items).toHaveLength(3)
    expect(items.map((item) => item.id)).toEqual([
      'v1c2a-admin-1',
      'v1c2a-admin-2',
      'v1c2a-admin-3',
    ])
    expect(items[0]?.videoUrl).toBe(V1C2A_ADMIN_ASSET_A)
    expect(items[1]?.videoUrl).toBe(V1C2A_ADMIN_ASSET_B)
    expect(items[2]?.videoUrl).toBe(V1C2A_ADMIN_ASSET_A)
    for (const item of items) {
      expect(isPlayableOwnedNativeUrl(item.videoUrl)).toBe(true)
      expect(isV1C2AAdminValidationOwnedNativeItem(item)).toBe(true)
      expect(isYouTubeUrl(item.videoUrl)).toBe(false)
      expect(isYouTubeUrl(getPrimaryVideo(item)?.url)).toBe(false)
      expect(selectOwnedNativePlayback(item).status).toBe('original')
      expect(item.videoEmbedUrl).toBeUndefined()
      expect(item.status).toBe('draft')
    }
  })

  it('uses no-op updates and skips markReelSeen / analytics writes', () => {
    expect(v1c2aAdminValidationNoopUpdate()).toBeUndefined()
    const item = read('src/components/video/VideoFeedItem.tsx')
    expect(item).toContain('isolateFromAnalytics')
    expect(item).toContain('if (isolateFromAnalytics) return')
    expect(item).toContain('if (!isolateFromAnalytics)')
    expect(item).toContain('enabled: surface !== \'video\' && !isolateFromAnalytics')
    expect(item).toContain('markReelSeen')
    expect(item).toContain('incrementViews')
    const client = read('src/components/video/V1C2ANativeValidationClient.tsx')
    expect(client).toContain('isolateFromAnalytics')
    expect(client).not.toContain('VideoActions')
    expect(client).not.toContain('VideoCommentSheet')
  })

  it('exercises V1C.2A preload roles and swipe generation', () => {
    expect(nativePreloadRoleFor(0, 0)).toBe('current')
    expect(nativePreloadRoleFor(1, 0)).toBe('next')
    expect(nativePreloadRoleFor(2, 0)).toBe('nextPlus1')
    const client = read('src/components/video/V1C2ANativeValidationClient.tsx')
    expect(client).toContain('nativePreloadRoleFor')
    expect(client).toContain('swipeGeneration={activeIndex}')
    expect(client).toContain('VideoFeedItem')
    expect(client).not.toContain('<video')
    const sidebar = read('src/components/admin/CMSSidebar.tsx')
    expect(sidebar).not.toContain('v1c2a-native-validation')
    const sitemap = read('src/lib/sitemap/sitemapIndex.ts')
    expect(sitemap).not.toContain('v1c2a-native-validation')
  })
})
