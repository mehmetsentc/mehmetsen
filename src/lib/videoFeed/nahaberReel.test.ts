import { describe, expect, it } from 'vitest'
import { mergeVideoPages, nahaberReelUrl, withNahaberReel } from './nahaberReel'
import { hasPlayableVisualVideo } from './playableVisual'

const REEL = 'https://storage.googleapis.com/nahaberapp.firebasestorage.app/videos/reels/abc123.mp4'
const YT = 'https://www.youtube.com/watch?v=0gUoReZ-dLc'
const OWN = 'https://firebasestorage.googleapis.com/v0/b/nahaberapp.firebasestorage.app/o/news-videos%2Fa.mp4?alt=media'

describe('VIDEO-REEL-1 NaHaber Reels video akışında', () => {
  it('Reels bağlantısı yalnız NaHaber deposundan kabul edilir', () => {
    expect(nahaberReelUrl({ reelVideoUrl: REEL })).toBe(REEL)
    expect(nahaberReelUrl({ reelVideoUrl: 'https://evil.example.com/videos/reels/a.mp4' })).toBeNull()
    expect(nahaberReelUrl({})).toBeNull()
  })
  it('videosuz haber Reels ile oynatılabilir olur', () => {
    const d = withNahaberReel({ id: 'n1', title: 'Haber', hasVideo: false, coverImageUrl: 'https://x/a.jpg', reelVideoUrl: REEL })
    expect(d).toMatchObject({ videoUrl: REEL, hasVideo: true })
    expect(hasPlayableVisualVideo(d as never)).toBe(true)
  })
  it('ANKA YouTube videosu yerine NaHaber Reels oynatılır; haberin kendi MP4 dosyası korunur', () => {
    expect(withNahaberReel({ videoUrl: YT, videoEmbedUrl: YT, reelVideoUrl: REEL })).toMatchObject({ videoUrl: REEL, videoEmbedUrl: '' })
    expect(withNahaberReel({ videoUrl: OWN, reelVideoUrl: REEL }).videoUrl).toBe(OWN)
    const none = { videoUrl: YT }
    expect(withNahaberReel(none)).toBe(none)
  })
  it('sayfalar tarih sırasıyla birleşir; aynı haber bir kez, Reels kopyası kazanır', () => {
    const old = { id: 'anka', publishedAt: '2026-08-18T10:00:00Z', v: 'yt' }
    const both = { id: 'n2', publishedAt: '2026-10-30T10:00:00Z', v: 'yt' }
    const reelNew = { id: 'n1', publishedAt: '2026-11-01T10:00:00Z', v: 'reel' }
    const reelBoth = { id: 'n2', publishedAt: '2026-10-30T10:00:00Z', v: 'reel' }
    expect(mergeVideoPages([old, both], [reelNew, reelBoth]).map((p) => `${p.id}:${p.v}`)).toEqual(['n1:reel', 'n2:reel', 'anka:yt'])
  })
})
