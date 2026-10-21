import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readerVideoEmbedSrc } from './ReaderVideoPlayer'
import { resolveFeedCardVideo } from '@/lib/videoFeed/feedCardVideo'

// ARTICLE-VIDEO-1: the feed reader (mobile «haber detay», iOS app) renders the story video.
describe('ARTICLE-VIDEO-1 reader video', () => {
  it('owned MP4 and reels resolve as native video; YouTube gets an inline embed', () => {
    const mp4 = resolveFeedCardVideo('https://storage.googleapis.com/nahaberapp.firebasestorage.app/videos/reels/abc.mp4')
    expect(mp4?.kind).toBe('native')
    expect(readerVideoEmbedSrc(mp4!)).toBeNull()
    const yt = resolveFeedCardVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(readerVideoEmbedSrc(yt!)).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(readerVideoEmbedSrc(yt!)).toContain('playsinline=1')
  })

  it('reader wires the play button over the hero photo and a player when there is no photo', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'), 'utf8')
    expect(src).toContain('resolveFeedCardVideo(detail?.video ?? item.video ?? null)')
    expect(src).toContain('<ReaderVideoPlayButton onPlay={() => setVideoOpen(true)} />')
    expect(src).toContain('data-testid="feed-reader-video-hero"')
  })
})
