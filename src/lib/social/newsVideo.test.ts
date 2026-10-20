import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'

const st = vi.hoisted(() => ({ files: new Map<string, Buffer>(), saved: [] as string[] }))
vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => null,
  getAdminStorage: () => ({
    bucket: () => ({
      file: (name: string) => ({
        name,
        exists: async () => [st.files.has(name)],
        download: async ({ destination }: { destination: string }) => {
          await fs.writeFile(destination, st.files.get(name)!)
        },
        save: async (buf: Buffer) => {
          st.files.set(name, buf)
          st.saved.push(name)
        },
        makePublic: async () => undefined,
      }),
    }),
  }),
}))

import { classifyVideoUrl, newsHasVideo, newsVideoCandidates, newsVideoLabel, resolveNewsVideo } from './newsVideo'
import { prepareSourceVideo, sourceStoragePath } from '../reels/sourceVideo'
import { needsVideoRebuild, reelSourceFromDoc } from '../reels/reelService'
import { socialEligibility } from './eligibility'

const OWNED = 'https://firebasestorage.googleapis.com/v0/b/nahaberapp.firebasestorage.app/o/news-videos%2Fadmin%2F1_imported.mp4?alt=media&token=x'
const EXT = 'https://cdn.ajans.example/video/2026/10/haber.mp4'
const HLS = 'https://stream.example.com/live/playlist.m3u8'
const YT = 'https://www.youtube.com/watch?v=0gUoReZ-dLc'

describe('haber videosu çözümleyici', () => {
  it('bütün video alanlarına bakar (playbackUrl, videoUrl, videoEmbedUrl, mediaItems, bodyBlocks)', () => {
    expect(
      newsVideoCandidates({
        playbackUrl: 'a',
        videoUrl: 'b',
        videoEmbedUrl: 'c',
        mediaItems: [{ type: 'image', url: 'x' }, { type: 'video', url: 'd' }],
        bodyBlocks: [{ type: 'text', text: 'y' }, { type: 'video', url: 'e' }],
      }),
    ).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('türleri doğru ayırır', () => {
    expect(classifyVideoUrl(OWNED)).toMatchObject({ kind: 'file', origin: 'nahaber', hls: false })
    expect(classifyVideoUrl(EXT)).toMatchObject({ kind: 'file', origin: 'external', hls: false })
    expect(classifyVideoUrl(HLS)).toMatchObject({ kind: 'file', origin: 'external', hls: true })
    expect(classifyVideoUrl(YT)).toEqual({ kind: 'youtube', id: '0gUoReZ-dLc', watchUrl: YT })
    expect(classifyVideoUrl('https://www.youtube-nocookie.com/embed/0gUoReZ-dLc')).toMatchObject({ kind: 'youtube' })
    expect(classifyVideoUrl('https://vimeo.com/12345')).toMatchObject({ kind: 'embed' })
    expect(classifyVideoUrl('http://insecure.example.com/a.mp4')).toMatchObject({ kind: 'embed' })
    expect(classifyVideoUrl('https://example.com/haber')).toBeNull()
  })

  it('dosya YouTube’dan, NaHaber dosyası dış dosyadan önce gelir', () => {
    expect(resolveNewsVideo({ videoUrl: YT, mediaItems: [{ type: 'video', url: EXT }] })).toMatchObject({ kind: 'file', url: EXT })
    expect(resolveNewsVideo({ videoUrl: EXT, bodyBlocks: [{ type: 'video', url: OWNED }] })).toMatchObject({ kind: 'file', url: OWNED })
    expect(resolveNewsVideo({ videoUrl: YT })).toMatchObject({ kind: 'youtube' })
    expect(resolveNewsVideo({})).toEqual({ kind: 'none' })
    expect(newsHasVideo({ hasVideo: true })).toBe(true)
    expect(newsVideoLabel(resolveNewsVideo({ videoUrl: YT }))).toBe('YouTube videosu')
  })

  it('Reels kaynağı: dosya videoyu kullanır, YouTube’u indirmez', () => {
    const file = reelSourceFromDoc({ title: 't', bodyBlocks: [{ type: 'video', url: EXT }], coverImageUrl: 'https://x/a.jpg' }, { alwaysUseMedia: true })
    expect(file).toMatchObject({ videoUrl: EXT, videoOrigin: 'external', videoKind: 'file', mediaAllowed: true })
    const yt = reelSourceFromDoc({ title: 't', videoUrl: YT, hasVideo: true, coverImageUrl: 'https://x/a.jpg' }, { alwaysUseMedia: true })
    expect(yt).toMatchObject({ videoUrl: null, videoKind: 'youtube' })
  })

  it('videolu haber artık sosyal uygunluk kontrolünde engellenmez', () => {
    const h = { isOwnContent: () => true, isSkippableForSocial: () => false, extractImageUrl: () => 'https://x/a.jpg' }
    expect(socialEligibility({ title: 't', hasVideo: true }, h)).toMatchObject({ ok: true })
  })

  it('fotoğraftan üretilmiş Reels, kullanılabilir video gelince bir kez yeniden üretilir', () => {
    const src = { videoUrl: EXT, mediaAllowed: true }
    expect(needsVideoRebuild(src, { media: 'image' })).toBe(true)
    expect(needsVideoRebuild(src, { media: 'video' })).toBe(false)
    // aynı kaynak daha önce denendiyse her paylaşımda tekrar üretilmez
    expect(needsVideoRebuild(src, { media: 'image', videoSource: EXT })).toBe(false)
    expect(needsVideoRebuild({ videoUrl: null, mediaAllowed: true }, { media: 'image' })).toBe(false)
  })
})

describe('kaynak videoyu hazırlama', () => {
  const MP4 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 1, 2, 3])
  beforeEach(() => {
    st.files.clear()
    st.saved = []
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('dış MP4 bir kez NaHaber Storage’a kopyalanır, sonra oradan kullanılır', async () => {
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      calls++
      return new Response(MP4, { status: 200, headers: { 'content-length': String(MP4.length) } })
    })
    const a = await prepareSourceVideo({ url: EXT, origin: 'external', hls: false, tag: 'n1', storeKey: 'n1' })
    expect(a).toMatchObject({ ok: true, stored: true })
    expect(st.saved).toEqual([sourceStoragePath('n1', EXT)])
    expect(await fs.readFile((a as { path: string }).path)).toEqual(MP4)
    const b = await prepareSourceVideo({ url: EXT, origin: 'external', hls: false, tag: 'n1', storeKey: 'n1' })
    expect(b).toMatchObject({ ok: true, stored: true })
    expect(calls).toBe(1)
  })

  it('NaHaber dosyası yeniden kopyalanmaz; çok büyük / erişilemeyen kaynak hata döner (askıda kalmaz)', async () => {
    vi.stubGlobal('fetch', async () => new Response(MP4, { status: 200 }))
    expect(await prepareSourceVideo({ url: OWNED, origin: 'nahaber', hls: false, tag: 'n2', storeKey: 'n2' })).toMatchObject({ ok: true, stored: false })
    expect(st.saved).toHaveLength(0)
    vi.stubGlobal('fetch', async () => new Response('x', { status: 200, headers: { 'content-length': String(500 * 1024 * 1024) } }))
    expect(await prepareSourceVideo({ url: EXT, origin: 'external', hls: false, tag: 'n3', storeKey: 'n3' })).toEqual({ ok: false, reason: 'too_large' })
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 404 }))
    expect(await prepareSourceVideo({ url: EXT, origin: 'external', hls: false, tag: 'n4', storeKey: 'n4' })).toEqual({ ok: false, reason: 'download_failed' })
    vi.stubGlobal('fetch', async () => {
      const e = new Error('timeout')
      e.name = 'TimeoutError'
      throw e
    })
    expect(await prepareSourceVideo({ url: EXT, origin: 'external', hls: false, tag: 'n5', storeKey: 'n5' })).toEqual({ ok: false, reason: 'timeout' })
  })

  it('HLS: ffmpeg çalışmazsa hata döner', async () => {
    const r = await prepareSourceVideo({ url: HLS, origin: 'external', hls: true, tag: 'n6', storeKey: 'n6', ffmpeg: async () => '/nonexistent/ffmpeg' })
    expect(r).toEqual({ ok: false, reason: 'hls_failed' })
  })
})
