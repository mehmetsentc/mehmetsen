/** MEDIA-1 — medya projesi: hak kaydı, bölüm doğrulama, üretim anahtarı, platform sınırları, kayıt. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from '@/lib/social/accounts/testing/fakeFirestore'
import {
  clipAfterEdit,
  clipFfmpegArgs,
  clipRenderKey,
  DEFAULT_CLIP_OPTIONS,
  mediaCaption,
  mediaLedgerKey,
  parseClipInput,
  parseClipOptions,
  parseRights,
  shareProblem,
  type MediaClip,
} from './mediaProject'

const h = vi.hoisted(() => ({ db: null as unknown, row: null as Record<string, unknown> | null, audits: [] as unknown[] }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))
vi.mock('@/lib/social/accounts/audit', () => ({ writeSocialAudit: vi.fn(async (e: unknown) => void h.audits.push(e)) }))
vi.mock('@/db', () => ({
  hasDatabaseUrl: () => true,
  getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => (h.row ? [h.row] : []) }) }) }) }),
}))
vi.mock('@/lib/storage', () => ({ getMediaUrl: (k: string | null | undefined) => (k ? `https://storage.googleapis.com/b/${k}` : undefined) }))

const ready = (c: Partial<MediaClip> = {}): MediaClip => ({
  id: 'abc123', name: 'B', startMs: 0, endMs: 30_000, title: 'T', options: { ...DEFAULT_CLIP_OPTIONS },
  status: 'ready', renderKey: 'k', outputUrl: 'https://storage.googleapis.com/b/x.mp4', coverUrl: null, seconds: 30, error: null, renderedAt: 1, ...c,
})

describe('model', () => {
  it('hak kaydı: sahip dışında kaynak; izin/lisans/kullanıcı için kayıt yeri zorunlu', () => {
    expect(parseRights({ kind: 'owned' })).toMatchObject({ ok: true })
    expect(parseRights({ kind: 'licensed', sourceName: 'DHA' })).toMatchObject({ ok: false, field: 'rights.note' })
    expect(parseRights({ kind: 'licensed', sourceName: 'DHA', note: 'Sözleşme 2026/4' })).toMatchObject({ ok: true })
    expect(parseRights({ kind: 'found_online' })).toMatchObject({ ok: false, field: 'rights.sourceName' })
    expect(parseRights({ kind: 'yok' })).toMatchObject({ ok: false })
  })

  it('bölüm: 3 sn – 3 dk, video süresini aşamaz; orijinal haliyle hiçbir katman yok', () => {
    expect(parseClipInput({ id: 'abc123', startMs: 0, endMs: 2000 }, 60_000)).toMatchObject({ ok: false })
    expect(parseClipInput({ id: 'abc123', startMs: 0, endMs: 200_000 }, null)).toMatchObject({ ok: false })
    expect(parseClipInput({ id: 'abc123', startMs: 50_000, endMs: 70_000 }, 60_000)).toMatchObject({ ok: false })
    expect(parseClipInput({ id: 'ABC!', startMs: 0, endMs: 5000 }, null)).toMatchObject({ ok: false })
    expect(parseClipOptions({ frame: 'original', showTitle: true, showLogo: true, showSource: true, mute: true })).toEqual({ frame: 'original', showTitle: false, showLogo: false, showSource: false, mute: true })
  })

  it('üretim anahtarı: kesit / yazı / kaynak değişince değişir; aynı içerikte hazır çıktı korunur', () => {
    const base = { startMs: 0, endMs: 10_000, title: 'A', options: { ...DEFAULT_CLIP_OPTIONS } }
    const k = clipRenderKey('v1', base, 'DHA')
    expect(clipRenderKey('v1', base, 'DHA')).toBe(k)
    expect(clipRenderKey('v1', { ...base, endMs: 11_000 }, 'DHA')).not.toBe(k)
    expect(clipRenderKey('v1', { ...base, title: 'B' }, 'DHA')).not.toBe(k)
    expect(clipRenderKey('v1', base, 'AA')).not.toBe(k)
    // Title off → title text no longer matters.
    const off = { ...base, options: { ...base.options, showTitle: false } }
    expect(clipRenderKey('v1', { ...off, title: 'X' }, 'DHA')).toBe(clipRenderKey('v1', { ...off, title: 'Y' }, 'DHA'))
    const prev = ready({ ...base, renderKey: k })
    expect(clipAfterEdit({ id: prev.id, name: 'yeni ad', ...base }, prev, 'v1', 'DHA')).toMatchObject({ status: 'ready', name: 'yeni ad', outputUrl: prev.outputUrl })
    expect(clipAfterEdit({ id: prev.id, name: 'B', ...base, endMs: 12_000 }, prev, 'v1', 'DHA')).toMatchObject({ status: 'draft', outputUrl: null })
  })

  it('paylaşım: izinsiz video hiçbir yere; platform süreleri; YouTube 60 sn üstü yalnız kendi görüntümüz', () => {
    const owned = { rights: { kind: 'owned' as const, sourceName: null, note: null } }
    const lic = { rights: { kind: 'licensed' as const, sourceName: 'DHA', note: 'x' } }
    const found = { rights: { kind: 'found_online' as const, sourceName: 'TikTok hesabı', note: null } }
    expect(shareProblem(found, ready(), 'instagram', 'reel')).toContain('izni yok')
    expect(shareProblem(owned, ready({ status: 'draft', outputUrl: null }), 'instagram', 'reel')).toContain('üretin')
    expect(shareProblem(owned, ready({ endMs: 120_000 }), 'facebook', 'reel')).toContain('90 sn')
    expect(shareProblem(owned, ready({ endMs: 120_000 }), 'instagram', 'reel')).toBeNull()
    expect(shareProblem(owned, ready({ endMs: 120_000 }), 'threads', 'reel')).toBeNull()
    expect(shareProblem(owned, ready({ endMs: 90_000 }), 'instagram', 'video_story')).toContain('60 sn')
    expect(shareProblem(owned, ready(), 'threads', 'video_story')).toContain('desteklemez')
    expect(shareProblem(owned, ready({ endMs: 120_000 }), 'youtube', 'reel')).toBeNull()
    expect(shareProblem(lic, ready({ endMs: 120_000 }), 'youtube', 'reel')).toContain('60 sn')
    expect(shareProblem(lic, ready({ endMs: 59_000 }), 'youtube', 'reel')).toBeNull()
  })

  it('metin kaynağı yazar, haber bağlıysa bağlantı ekler; kayıt anahtarı bölüm başına ayrı', () => {
    const p = { caption: 'Sağanak sonrası cadde', title: 'P', rights: { kind: 'user_submitted' as const, sourceName: 'Ayşe K.', note: 'mesaj' } }
    expect(mediaCaption(p, { title: 'B' }, 'https://www.nahaber.com/haber/x')).toBe('Sağanak sonrası cadde\n\nHaberin tamamı: https://www.nahaber.com/haber/x\n\nKaynak: Ayşe K.')
    expect(mediaCaption({ ...p, caption: '', rights: { kind: 'owned', sourceName: null, note: null } }, { title: 'Bölüm başlığı' }, null)).toBe('Bölüm başlığı')
    expect(mediaLedgerKey('mp1', 'abc123')).toBe('media_mp1_abc123')
    expect(mediaLedgerKey('mp1', 'abc123')).toMatch(/^[A-Za-z0-9_-]{1,128}$/)
  })

  it('ffmpeg: kabuk yok, yazısız dikeyde katman girdisi yok, orijinalde ölçek/kırpma yok', () => {
    const v = clipFfmpegArgs({ input: '/t/in', overlay: null, output: '/t/o.mp4', startMs: 1500, endMs: 4000, options: { ...DEFAULT_CLIP_OPTIONS, showTitle: false } })
    expect(v.filter((a) => a === '-i')).toHaveLength(1)
    expect(v).toContain('2.500')
    const o = clipFfmpegArgs({ input: '/t/in', overlay: '/t/ov.png', output: '/t/o.mp4', startMs: 0, endMs: 4000, options: parseClipOptions({ frame: 'original' }) })
    expect(o.filter((a) => a === '-i')).toHaveLength(1)
    expect(o.join(' ')).not.toContain('crop')
    expect(o).toContain('+faststart')
  })
})

describe('kayıt (Firestore)', () => {
  beforeEach(() => {
    h.db = new FakeFirestore()
    h.audits = []
    h.row = { id: 'vid0001', title: 'Sağanak', status: 'READY', rightsStatus: 'OWNED', durationMs: 95_000, posterStorageKey: 'p.jpg', playbackStorageKey: 'v.mp4', originalStorageKey: null, thumbnailUrl: null }
  })

  it('proje oluşturur (ilk bölüm 30 sn), hak kaydı zorunlu, kütüphanede onaysız video reddedilir', async () => {
    const { createProject } = await import('./mediaStore')
    expect((await createProject('u1', { videoItemId: 'vid0001' }, 1)).ok).toBe(false)
    const r = await createProject('u1', { videoItemId: 'vid0001', rights: { kind: 'owned' } }, 1)
    expect(r.ok && r.value.clips).toEqual([expect.objectContaining({ startMs: 0, endMs: 30_000, status: 'draft' })])
    expect(r.ok && r.value.sourceUrl).toBe('https://storage.googleapis.com/b/v.mp4')
    h.row = { ...h.row!, rightsStatus: 'UNKNOWN' }
    expect(await createProject('u1', { videoItemId: 'vid0001', rights: { kind: 'owned' } }, 1)).toMatchObject({ ok: false, code: 'video_rights' })
    expect(JSON.stringify(h.audits)).not.toContain('note')
  })

  it('bölüm düzenlenince eski üretim düşer; arada değişen bölüme gelen eski sonuç yazılmaz', async () => {
    const { createProject, setClipRendered, updateProject, getProject } = await import('./mediaStore')
    const { clipRenderKey: key, sourceLabelFor } = await import('./mediaProject')
    const c = await createProject('u1', { videoItemId: 'vid0001', rights: { kind: 'owned' } }, 1)
    if (!c.ok) throw new Error('create')
    const p = c.value
    const clip = p.clips[0]!
    const k = key(p.videoItemId, clip, sourceLabelFor(p.rights))
    expect(await setClipRendered(p.id, clip.id, k, { outputUrl: 'https://s/x.mp4', coverUrl: null, seconds: 30 }, 2)).toBe(true)
    expect((await getProject(p.id))!.clips[0]).toMatchObject({ status: 'ready', outputUrl: 'https://s/x.mp4' })
    // Yeniden adlandırma: üretim korunur.
    let u = await updateProject('u1', p.id, { clips: [{ ...clip, name: 'Açılış' }] }, 3)
    expect(u.ok && u.value.clips[0]).toMatchObject({ status: 'ready', name: 'Açılış' })
    // Kesit değişti: taslağa döner; eski anahtarla gelen sonuç yazılmaz.
    u = await updateProject('u1', p.id, { clips: [{ ...clip, endMs: 20_000 }] }, 4)
    expect(u.ok && u.value.clips[0]).toMatchObject({ status: 'draft', outputUrl: null })
    expect(await setClipRendered(p.id, clip.id, k, { outputUrl: 'https://s/old.mp4', coverUrl: null, seconds: 30 }, 5)).toBe(false)
    // Kaynak etiketi görüntünün parçası: hak sahibi değişince bölüm yeniden üretilmeli.
    const k2 = key(p.videoItemId, { ...clip, endMs: 20_000 }, null)
    await setClipRendered(p.id, clip.id, k2, { outputUrl: 'https://s/y.mp4', coverUrl: null, seconds: 20 }, 6)
    u = await updateProject('u1', p.id, { rights: { kind: 'licensed', sourceName: 'DHA', note: 'Sözleşme' } }, 7)
    expect(u.ok && u.value.clips[0]).toMatchObject({ status: 'draft' })
    // En fazla 12 bölüm; aynı kimlik iki kez olmaz.
    expect(await updateProject('u1', p.id, { clips: Array.from({ length: 13 }, (_, i) => ({ id: `c${i}aaaa`, startMs: 0, endMs: 5000 })) }, 8)).toMatchObject({ ok: false, code: 'too_many_clips' })
    expect(await updateProject('u1', p.id, { clips: [{ id: 'aaaa11', startMs: 0, endMs: 5000 }, { id: 'aaaa11', startMs: 0, endMs: 6000 }] }, 9)).toMatchObject({ ok: false, code: 'duplicate_clip' })
  })
})
