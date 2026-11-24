import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from '@/lib/social/accounts/testing/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as unknown, audits: [] as Array<{ action: string }> }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))
vi.mock('@/lib/social/accounts/audit', () => ({ writeSocialAudit: vi.fn(async (e: { action: string }) => void h.audits.push(e)) }))
vi.mock('@/db', () => ({ hasDatabaseUrl: () => false, getDb: () => null }))
vi.mock('@/lib/storage', () => ({ getMediaUrl: () => undefined }))
// no ffmpeg in tests: duration unknown
vi.mock('ffmpeg-static', () => ({ default: null }))

const ORIG = 'https://firebasestorage.googleapis.com/v0/b/x/o/news%2Fvid.mp4?alt=media'

describe('HABER-VIDEO — haberin kendi videosunu düzenle, habere uygula, orijinale dön', () => {
  beforeEach(async () => {
    h.db = new FakeFirestore()
    h.audits = []
    const db = h.db as FakeFirestore
    await db.collection('news').doc('news0001').set({
      title: 'Kozan yangını',
      slug: 'kozan-yangini',
      videoUrl: ORIG,
      mediaItems: [{ type: 'image', url: 'https://x/a.jpg' }, { type: 'video', url: ORIG }],
    })
    await db.collection('news').doc('news0002').set({ title: 'YT', videoUrl: 'https://www.youtube.com/watch?v=abc' })
  })

  it('haber videosundan proje açılır; aynı haber tekrar açılınca aynı proje döner', async () => {
    const { projectForNewsVideo } = await import('./mediaStore')
    const a = await projectForNewsVideo('u1', 'news0001', 1)
    expect(a.ok && a.value).toMatchObject({ sourceKind: 'news', sourceFileUrl: ORIG, linkedNewsId: 'news0001', rights: { kind: 'owned' } })
    expect(a.ok && a.value.clips[0]?.options).toMatchObject({ frame: 'original', outro: false })
    const b = await projectForNewsVideo('u1', 'news0001', 2)
    expect(b.ok && a.ok && b.value.id).toBe(a.ok ? a.value.id : '')
    const yt = await projectForNewsVideo('u1', 'news0002', 3)
    expect(yt.ok).toBe(false)
  })

  it('üretilen parça habere uygulanır, orijinal yedekte; orijinale dönüş eski alanları aynen geri yazar', async () => {
    const { projectForNewsVideo, applyToNews } = await import('./mediaStore')
    const db = h.db as FakeFirestore
    const p = await projectForNewsVideo('u1', 'news0001', 1)
    if (!p.ok) throw new Error('proje yok')
    const clip = p.value.clips[0]!
    expect((await applyToNews('u1', p.value.id, { action: 'apply', clipId: clip.id }, 2)).ok).toBe(false) // henüz üretilmedi
    const ready = { ...p.value, clips: [{ ...clip, status: 'ready', outputUrl: 'https://storage.googleapis.com/b/media/edit.mp4' }] }
    await db.collection('mediaProjects').doc(p.value.id).set(ready)
    const r = await applyToNews('u1', p.value.id, { action: 'apply', clipId: clip.id }, 3)
    expect(r.ok && r.value.slug).toBe('kozan-yangini')
    let n = (await db.collection('news').doc('news0001').get()).data() as Record<string, unknown>
    expect(n.videoUrl).toBe('https://storage.googleapis.com/b/media/edit.mp4')
    expect((n.mediaItems as Array<{ url: string }>)[1]!.url).toBe('https://storage.googleapis.com/b/media/edit.mp4')
    expect((n.mediaItems as Array<{ url: string }>)[0]!.url).toBe('https://x/a.jpg')
    expect(n.videoOriginalUrl).toBe(ORIG)
    // yeniden açılınca düzenlenmiş değil orijinal dosya üzerinde çalışır
    const again = await projectForNewsVideo('u1', 'news0001', 4)
    expect(again.ok && again.value.id).toBe(p.value.id)
    const back = await applyToNews('u1', p.value.id, { action: 'restore' }, 5)
    expect(back.ok).toBe(true)
    n = (await db.collection('news').doc('news0001').get()).data() as Record<string, unknown>
    expect(n.videoUrl).toBe(ORIG)
    expect((n.mediaItems as Array<{ url: string }>)[1]!.url).toBe(ORIG)
    expect(n.videoOriginal ?? null).toBeNull()
    expect(h.audits.map((a) => a.action)).toEqual(expect.arrayContaining(['media.news.apply', 'media.news.restore']))
  })

  it('kapanış kartı yalnız haber videosu projelerinde kapatılabilir', async () => {
    const { updateProject } = await import('./mediaStore')
    const db = h.db as FakeFirestore
    const base = { id: 'mp00000000000001', title: 'K', caption: '', videoItemId: 'vid0001', videoTitle: 'K', sourceUrl: null, durationMs: 60_000, posterUrl: null, rights: { kind: 'owned', sourceName: null, note: null }, linkedNewsId: null, clips: [], createdBy: 'u1', createdAt: 1, updatedAt: 1 }
    await db.collection('mediaProjects').doc(base.id).set(base)
    const clip = { id: 'abcd1234', name: 'P', startMs: 0, endMs: 10_000, title: '', options: { frame: 'original', outro: false } }
    const lib = await updateProject('u1', base.id, { clips: [clip] }, 2)
    expect(lib.ok && lib.value.clips[0]!.options.outro).toBeUndefined()
    await db.collection('mediaProjects').doc('mp00000000000002').set({ ...base, id: 'mp00000000000002', sourceKind: 'news', sourceFileUrl: ORIG, linkedNewsId: 'news0001' })
    const news = await updateProject('u1', 'mp00000000000002', { clips: [clip] }, 3)
    expect(news.ok && news.value.clips[0]!.options.outro).toBe(false)
  })
})
