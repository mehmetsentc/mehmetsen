import { describe, expect, it } from 'vitest'
import { canvasSize, clipMs, defaultClip, parseEdit, renderKeyFor, renderProblem, timeline, type EditAsset, type EditProject } from './editProject'
import { editFfmpegArgs } from './editFfmpeg'

const vid: EditAsset = { id: 'aaaa1', kind: 'video', source: 'upload', url: 'https://x/v.mp4', name: 'v', durationMs: 20_000, addedAt: 1 }
const img: EditAsset = { id: 'bbbb2', kind: 'image', source: 'upload', url: 'https://x/i.jpg', name: 'i', durationMs: null, addedAt: 1 }
const base = (over: Partial<EditProject> = {}): EditProject => ({
  id: 'ep0123456789abcdef',
  title: 't',
  caption: '',
  aspect: '9:16',
  assets: [vid, img],
  clips: [],
  texts: [],
  audio: [],
  closing: true,
  linkedNewsId: null,
  newsVideo: false,
  newsApplied: null,
  render: { status: 'none', key: null, outputUrl: null, coverUrl: null, seconds: null, error: null, renderedAt: null },
  createdBy: 'u',
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

describe('kurgu model', () => {
  it('timeline overlaps transitions and cuts', () => {
    const a = { ...defaultClip(vid, 'c0001'), inMs: 0, outMs: 4000 }
    const b = { ...defaultClip(img, 'c0002'), transition: 'fade' as const }
    const c = { ...defaultClip(vid, 'c0003'), inMs: 5000, outMs: 7000, speed: 2 }
    const tl = timeline([a, b, c])
    expect(clipMs(c)).toBe(1000)
    expect(tl.starts).toEqual([0, 3500, 6460])
    expect(tl.total).toBe(7460)
  })
  it('canvas sizes per aspect, original follows the first video', () => {
    expect(canvasSize('9:16')).toEqual([1080, 1920])
    expect(canvasSize('16:9')).toEqual([1920, 1080])
    expect(canvasSize('original', { w: 1280, h: 720 })).toEqual([1920, 1080])
    expect(canvasSize('original', { w: 720, h: 1280 })).toEqual([1080, 1920])
  })
  it('parseEdit validates clips and caps 3 minutes', () => {
    const p = base()
    const ok = parseEdit({ clips: [defaultClip(vid, 'c0001')] }, p)
    expect(ok.ok).toBe(true)
    const bad = parseEdit({ clips: [{ ...defaultClip(vid, 'c0001'), assetId: 'nope1' }] }, p)
    expect(bad.ok).toBe(false)
    const long = parseEdit({ clips: Array.from({ length: 10 }, (_, i) => ({ ...defaultClip(vid, `c000${i}`), speed: 1 })) }, p)
    expect(long.ok).toBe(false)
  })
  it('closing can be switched off only for a news item’s own video', () => {
    const r1 = parseEdit({ closing: false }, base())
    expect(r1.ok && r1.value.closing).toBe(true)
    const r2 = parseEdit({ closing: false }, base({ newsVideo: true }))
    expect(r2.ok && r2.value.closing).toBe(false)
  })
  it('render key changes with content, problem when empty', () => {
    const p = base({ clips: [defaultClip(vid, 'c0001')] })
    const k1 = renderKeyFor(p)
    expect(renderKeyFor({ ...p, aspect: '1:1' })).not.toBe(k1)
    expect(renderKeyFor(p)).toBe(k1)
    expect(renderProblem(base())).toMatch(/en az bir/)
    expect(renderProblem(p)).toBeNull()
  })
})

describe('kurgu ffmpeg args', () => {
  it('builds one graph with xfade, text overlay, music mix and closing', () => {
    const a = { ...defaultClip(vid, 'c0001'), outMs: 4000, crop: { x: 0.1, y: 0, w: 0.8, h: 1 }, flipH: true }
    const b = { ...defaultClip(img, 'c0002'), transition: 'fade' as const, animIn: 'zoom' as const }
    const args = editFfmpegArgs({
      W: 1080,
      H: 1920,
      clips: [
        { clip: a, kind: 'video', path: '/tmp/v.mp4', hasAudio: true },
        { clip: b, kind: 'image', path: '/tmp/i.jpg', hasAudio: false },
      ],
      texts: [{ item: { id: 't0001', text: 'Merhaba', startMs: 0, endMs: 2000, style: 'altbant', x: 0.5, y: 0.8, size: 60, color: '#FFFFFF' }, png: '/tmp/t.png' }],
      audio: [{ item: { id: 'm0001', kind: 'music', assetId: null, music: 'modern', text: null, startMs: 0, endMs: null, volume: 0.25, fade: true }, path: '/tmp/m.m4a', loop: true }],
      outro: { image: '/tmp/o.jpg', sting: null },
      output: '/tmp/out.mp4',
    })
    const graph = args[args.indexOf('-filter_complex') + 1]!
    expect(graph).toContain('xfade=transition=fade')
    expect(graph).toContain('hflip')
    expect(graph).toContain('crop=')
    expect(graph).toContain('amix')
    expect(graph).toContain("enable='between(t,0.000,2.000)'")
    expect(args).toContain('/tmp/o.jpg')
    expect(args[args.length - 1]).toBe('/tmp/out.mp4')
    expect(args.some((x) => x.includes(';') && x !== graph)).toBe(false)
  })
})
