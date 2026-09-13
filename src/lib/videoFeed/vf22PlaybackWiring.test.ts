import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('VF2.2R player pause/sound wiring', () => {
  it('VideoFeedItem honors userPaused against observer, ready, mute, and YT args array', () => {
    const src = read('src/components/video/VideoFeedItem.tsx')
    expect(src).toContain('userPausedRef')
    expect(src).toContain('shouldObserverRestartPlayback')
    expect(src).toContain('setActiveReelsAudioSink')
    expect(src).toContain('reportPlayerMuted')
    expect(src).toContain("sendYTCmd('pauseVideo')")
    expect(src).toContain('youtubeCommandPayload')
    expect(src).toContain('applyYoutubeMuteIntent')
    expect(src).toContain('nextUserPausedFromTap')
    expect(src).toContain('youtubeEmbedParentOrigin')
    expect(src).toContain('youtubeEmbedSrc')
    expect(src).not.toContain('origin=https://nahaber.com')
    expect(src).not.toContain("args: ''")
    expect(src).not.toContain("args: string | unknown[] = ''")
    expect(src).toContain('args: unknown[] = []')
  })

  it('audio toggle applies mute on the click stack without optimistic Sesli', () => {
    const ctx = read('src/store/reelsAudioContext.tsx')
    expect(ctx).toContain('applyReelsAudioPreference')
    expect(ctx).toContain('effectiveMuted')
    expect(ctx).toContain('reportPlayerMuted')
    expect(ctx).not.toMatch(/setPlayerMuted\(next\)/)
    expect(ctx).not.toMatch(/setPlayerMuted\(value\)/)
    const actions = read('src/components/video/VideoActions.tsx')
    expect(actions).toContain('effectiveMuted')
  })

  it('SmartFeedCardVideo uses the same YouTube args array + unmute volume commands', () => {
    const src = read('src/components/feed/smart/SmartFeedCardVideo.tsx')
    expect(src).toContain('youtubeCommandPayload')
    expect(src).toContain('applyYoutubeMuteIntent')
    expect(src).toContain('nextUserPausedFromTap')
    expect(src).toContain('youtubeEmbedParentOrigin')
    expect(src).not.toContain('origin=https://nahaber.com')
    expect(src).not.toContain("args: ''")
    expect(src).toContain('args: unknown[] = []')
  })
})

describe('VF2.2R feed-v2 extends existing card video path', () => {
  it('FullscreenNewsCard reuses SMART_FEED_VIDEO + playable resolver, no second feed', () => {
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    expect(card).toContain('isSmartFeedVideoEnabledClient')
    expect(card).toContain('resolveFeedCardVideo')
    expect(card).toContain('SmartFeedCardVideo')
    expect(card).toContain('smart-feed-fg-hero')
    expect(card).not.toContain('LivingVideoPlayer')
    expect(card).not.toContain('every 3')
    expect(card).not.toContain('.splice(')
  })

  it('FeedService sanitizes unplayable video URLs without dropping the article', () => {
    const svc = read('src/services/feed/FeedService.ts')
    expect(svc).toContain('sanitizeFeedVideoUrl(row.video)')
  })
})
