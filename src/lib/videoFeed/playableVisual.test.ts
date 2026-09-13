import { describe, expect, it } from 'vitest'
import {
  hasPlayableVisualVideo,
  getVisualVideoDedupKey,
  type VisualVideoCandidate,
} from '@/lib/videoFeed/playableVisual'

function candidate(overrides: VisualVideoCandidate = {}): VisualVideoCandidate {
  return {
    id: 'n1',
    title: 'Video haber',
    status: 'published',
    ...overrides,
  }
}

describe('hasPlayableVisualVideo', () => {
  it('accepts YouTube watch and embed URLs', () => {
    expect(
      hasPlayableVisualVideo(
        candidate({ videoUrl: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ' })
      )
    ).toBe(true)
    expect(
      hasPlayableVisualVideo(
        candidate({
          videoEmbedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9wgGcQ',
        })
      )
    ).toBe(true)
  })

  it('accepts Vimeo embed URLs', () => {
    expect(
      hasPlayableVisualVideo(
        candidate({ videoUrl: 'https://player.vimeo.com/video/123456789' })
      )
    ).toBe(true)
  })

  it('accepts Dailymotion embed URLs', () => {
    expect(
      hasPlayableVisualVideo(
        candidate({ videoUrl: 'https://www.dailymotion.com/embed/video/x7tzd2' })
      )
    ).toBe(true)
  })

  it('accepts owned native mp4 on Firebase Storage', () => {
    expect(
      hasPlayableVisualVideo(
        candidate({
          mediaItems: [
            {
              type: 'video',
              url: 'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/news-videos%2Fclip.mp4?alt=media',
            },
          ],
        })
      )
    ).toBe(true)
  })

  it('rejects audio-only / TTS posts', () => {
    expect(
      hasPlayableVisualVideo(
        candidate({
          audioUrl: 'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/tts.mp3?alt=media',
          isTTS: true,
        })
      )
    ).toBe(false)
  })

  it('rejects empty URL', () => {
    expect(hasPlayableVisualVideo(candidate({ videoUrl: '' }))).toBe(false)
    expect(hasPlayableVisualVideo(candidate({ mediaItems: [] }))).toBe(false)
  })

  it('rejects hasVideo=true with no playable URL', () => {
    expect(hasPlayableVisualVideo(candidate({ hasVideo: true, videoUrl: '' }))).toBe(false)
  })

  it('rejects external mp4 hotlinks', () => {
    expect(
      hasPlayableVisualVideo(
        candidate({
          mediaItems: [{ type: 'video', url: 'https://cdn.ankahaber.net/videos/clip.mp4' }],
        })
      )
    ).toBe(false)
  })

  it('rejects HLS even on an owned host', () => {
    expect(
      hasPlayableVisualVideo(
        candidate({
          videoUrl: 'https://www.nahaber.com/media/live.m3u8',
        })
      )
    ).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(hasPlayableVisualVideo(candidate({ videoUrl: 'not-a-url' }))).toBe(false)
    expect(hasPlayableVisualVideo(candidate({ videoUrl: 'https://' }))).toBe(false)
  })

  it('builds a YouTube provider dedup key', () => {
    expect(
      getVisualVideoDedupKey(
        candidate({ videoUrl: 'https://youtu.be/dQw4w9wgGcQ?si=abc' })
      )
    ).toBe('yt:dQw4w9wgGcQ')
  })
})
