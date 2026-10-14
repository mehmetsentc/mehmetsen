import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: vi.fn(), getAdminStorage: vi.fn() }))

import { attachReelVideoRows } from './reelLibrary'
import { parseVoiceSettings } from './voiceRules'
import { isOwnedNativeVideoUrl } from '@/lib/videoFeed/playableVisual'
import { sanitizeFeedVideoUrl } from '@/lib/videoFeed/feedCardVideo'

const REEL = 'https://storage.googleapis.com/nahaberapp.firebasestorage.app/videos/reels/abc123.mp4?v=1760000000'

describe('REELS-5 saved reels in the smart feed', () => {
  it('our bucket reel URLs count as owned native video', () => {
    expect(isOwnedNativeVideoUrl(REEL)).toBe(true)
    expect(sanitizeFeedVideoUrl(REEL)).toBe(REEL)
    expect(isOwnedNativeVideoUrl('https://storage.googleapis.com/someone-else/videos/x.mp4')).toBe(false)
    expect(isOwnedNativeVideoUrl('https://storage.googleapis.com/nahaberapp.firebasestorage.app/private/x.mp4')).toBe(false)
  })
  it('attaches a reel only when the row has no video, by id or slug', () => {
    const map = new Map([['n1', REEL], ['slug:haber-iki', REEL]])
    const rows = [
      { articleId: 'n1', slug: 'a', video: null },
      { articleId: 'pg-uuid', slug: 'haber-iki', video: null },
      { articleId: 'n1', slug: 'a', video: 'https://firebasestorage.googleapis.com/v0/own.mp4' },
      { articleId: 'zz', slug: 'zz', video: null },
    ]
    const out = attachReelVideoRows(rows, map)
    expect(out.map((r) => r.video)).toEqual([REEL, REEL, 'https://firebasestorage.googleapis.com/v0/own.mp4', null])
    expect(attachReelVideoRows(rows, new Map())).toBe(rows)
  })
  it('cover look is a studio setting', () => {
    expect(parseVoiceSettings({ cover: 'panel' }).cover).toBe('panel')
    expect(parseVoiceSettings({ cover: 'weird' }).cover).toBeNull()
  })
})
