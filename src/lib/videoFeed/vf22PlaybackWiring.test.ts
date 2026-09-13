import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('VF2.2 player pause/sound wiring', () => {
  it('VideoFeedItem honors userPaused against observer, ready, and mute effects', () => {
    const src = read('src/components/video/VideoFeedItem.tsx')
    expect(src).toContain('userPausedRef')
    expect(src).toContain('shouldObserverRestartPlayback')
    expect(src).toContain('setActiveReelsAudioSink')
    expect(src).toContain('reportPlayerMuted')
    expect(src).toContain('if (userPausedRef.current)')
    expect(src).toContain("sendYTCmd('pauseVideo')")
  })

  it('audio toggle applies mute on the click stack', () => {
    const ctx = read('src/store/reelsAudioContext.tsx')
    expect(ctx).toContain('applyReelsAudioPreference')
    expect(ctx).toContain('effectiveMuted')
    expect(ctx).toContain('reportPlayerMuted')
    const actions = read('src/components/video/VideoActions.tsx')
    expect(actions).toContain('effectiveMuted')
  })
})

describe('VF2.2 feed-v2 extends existing card video path', () => {
  it('FullscreenNewsCard reuses SMART_FEED_VIDEO + playable resolver, no second feed', () => {
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    expect(card).toContain('isSmartFeedVideoEnabledClient')
    expect(card).toContain('resolveFeedCardVideo')
    expect(card).toContain('SmartFeedCardVideo')
    expect(card).toContain('smart-feed-fg-hero')
    expect(card).not.toContain('LivingVideoPlayer')
  })

  it('FeedService sanitizes unplayable video URLs without dropping the article', () => {
    const svc = read('src/services/feed/FeedService.ts')
    expect(svc).toContain('sanitizeFeedVideoUrl(row.video)')
  })
})
