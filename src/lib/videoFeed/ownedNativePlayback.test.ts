import { describe, expect, it } from 'vitest'
import { selectOwnedNativePlayback } from '@/lib/videoFeed/ownedNativePlayback'

const OWNED_ORIGINAL =
  'https://pub-a4c9a3e5bd28436199e6e2ac65357c45.r2.dev/news/video/clip.mp4'
const OWNED_PLAYBACK =
  'https://pub-a4c9a3e5bd28436199e6e2ac65357c45.r2.dev/video-library/item1/playback/720p.mp4'
const FIREBASE_MP4 =
  'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/news-videos%2Fclip.mp4?alt=media'

describe('selectOwnedNativePlayback', () => {
  it('prefers an explicit playback-ready owned MP4 when the current contract supplies it', () => {
    expect(
      selectOwnedNativePlayback({
        playbackUrl: OWNED_PLAYBACK,
        videoUrl: OWNED_ORIGINAL,
      })
    ).toEqual({ status: 'playback', url: OWNED_PLAYBACK })
  })

  it('prefers a playback-shaped owned URL among mediaItems over original', () => {
    expect(
      selectOwnedNativePlayback({
        mediaItems: [
          { type: 'video', url: OWNED_ORIGINAL },
          { type: 'video', url: OWNED_PLAYBACK },
        ],
      })
    ).toEqual({ status: 'playback', url: OWNED_PLAYBACK })
  })

  it('falls back to a valid owned native MP4', () => {
    expect(selectOwnedNativePlayback({ videoUrl: FIREBASE_MP4 })).toEqual({
      status: 'original',
      url: FIREBASE_MP4,
    })
  })

  it('rejects arbitrary third-party MP4 hotlinks', () => {
    expect(
      selectOwnedNativePlayback({
        videoUrl: 'https://cdn.ankahaber.net/videos/clip.mp4',
      })
    ).toEqual({ status: 'none' })
  })

  it('still rejects HLS/m3u8 even on an owned host', () => {
    expect(
      selectOwnedNativePlayback({
        videoUrl: 'https://www.nahaber.com/media/live.m3u8',
        playbackUrl: 'https://pub-a4c9a3e5bd28436199e6e2ac65357c45.r2.dev/video-library/item1/hls/index.m3u8',
      })
    ).toEqual({ status: 'none' })
  })

  it('returns none for poster/error fallback when no owned native file exists', () => {
    expect(
      selectOwnedNativePlayback({
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
        mediaItems: [{ type: 'image', url: 'https://www.nahaber.com/cover.webp' }],
      })
    ).toEqual({ status: 'none' })
  })
})
