/** STORY-1 — Konu → Video: doğrulama, cümle bölme, AI planı, zaman çizelgesi, ffmpeg argümanları. */
import { describe, expect, it } from 'vitest'
import {
  buildTimeline,
  captionChunks,
  chunkRanges,
  FRAMES,
  illustrationPrompt,
  shotList,
  estimateSeconds,
  imageKeyFor,
  missingImages,
  parseMeta,
  parsePlan,
  parseScenes,
  renderKeyFor,
  renderProblem,
  scenesFromScript,
  segmentLengths,
  splitSentences,
  storyCaption,
  XF,
  type StoryAsset,
  type StoryProject,
  type StoryScene,
} from './storyProject'
import { finalArgs, joinArgs, overlayConcat, segmentConcat, stillSegmentArgs, videoSegmentArgs, xfadeOffsets } from './storyFfmpeg'
import { overlayStates, stateAt } from './storyStates'

const asset = (id: string, kind: 'image' | 'video' = 'image', d: Partial<StoryAsset> = {}): StoryAsset => ({
  id, kind, source: kind === 'image' ? 'upload' : 'library', ref: `ref-${id}`, previewUrl: null, name: id, durationMs: kind === 'video' ? 20_000 : null, description: `açıklama ${id}`, describeError: null, addedAt: 1, ...d,
})
let n = 0
const nid = () => `sc${(++n).toString().padStart(4, '0')}`
const rights = { kind: 'owned' as const, sourceName: null, note: null }

describe('splitSentences', () => {
  it('keeps numbers, times and abbreviations together', () => {
    expect(splitSentences('Kazı 1.200 metrekareye yayıldı. Saat 19.30 gibi Dr. Ali geldi! Peki neden? Son.')).toEqual([
      'Kazı 1.200 metrekareye yayıldı.',
      'Saat 19.30 gibi Dr. Ali geldi!',
      'Peki neden?',
      'Son.',
    ])
  })
  it('splits long sentences at commas', () => {
    const long = 'Bu cümle çok uzun, içinde pek çok ayrıntı var ve okunması zorlaşıyor, bu yüzden bölünmesi gerekiyor, aksi halde ekranda üç dört satır kaplar ve izleyici kaçırır.'
    const parts = scenesFromScript(long, 80)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every((p) => p.length <= 80)).toBe(true)
    expect(parts.join(' ')).toBe(long)
  })
})

describe('parseMeta', () => {
  it('needs a topic or script and a rights record', () => {
    expect(parseMeta({ rights }).ok).toBe(false)
    expect(parseMeta({ topic: 'Truva', rights: { kind: 'found_online' } }).ok).toBe(false) // source name required
    const ok = parseMeta({ topic: 'Truva Atı gerçek miydi?', rights, style: 'paper' })
    expect(ok.ok && ok.value.title).toBe('Truva Atı gerçek miydi?')
    expect(ok.ok && ok.value.seriesLabel).toBe('NaHaber')
  })
  it('rejects an unknown style', () => {
    expect(parseMeta({ topic: 'x y', rights, style: 'neon' }).ok).toBe(false)
  })
})

describe('parsePlan', () => {
  const assets = [asset('a1'), asset('v1', 'video')]
  it('uses the AI scenes, validates asset ids and highlights', () => {
    const raw = JSON.stringify({
      title: 'Truva',
      caption: 'Truva gerçek mi? #tarih',
      scenes: [
        { text: 'Truva Atı gerçekten var mıydı?', highlights: ['Truva', 'yok'], label: 'Çanakkale', asset: 'a1', offsetSec: 0, prompt: null, reason: 'at fotoğrafı' },
        { text: 'Kazılar 1871 yılında başladı.', highlights: ['1871'], label: '1871', asset: 'v1', offsetSec: 4.5, prompt: null },
        { text: 'Tahta ata dair kalıntı yok.', highlights: [], label: null, asset: 'zzz', prompt: 'empty excavation pit with a magnifying glass' },
      ],
    })
    const p = parsePlan(raw, { script: '', topic: 'Truva', assets }, nid)
    expect(p.source).toBe('ai')
    expect(p.scenes).toHaveLength(3)
    expect(p.scenes[0].highlights).toEqual(['Truva']) // «yok» is not in the sentence
    expect(p.scenes[1].visual).toEqual({ kind: 'asset', assetId: 'v1', offsetMs: 4500 })
    expect(p.scenes[2].visual.kind).toBe('ai') // unknown asset → illustration
    expect(p.scenes[2].visual.kind === 'ai' && p.scenes[2].visual.prompt).toContain('magnifying')
  })
  it('never rewrites a given script', () => {
    const script = 'Birinci cümle burada. İkinci cümle de burada.'
    const raw = JSON.stringify({ scenes: [{ text: 'Tamamen farklı bir metin.', asset: 'a1' }, { text: 'Başka bir şey.', asset: null, prompt: 'x' }] })
    const p = parsePlan(raw, { script, topic: '', assets }, nid)
    expect(p.scenes.map((s) => s.text)).toEqual(['Birinci cümle burada.', 'İkinci cümle de burada.'])
    expect(p.scenes[0].visual.kind).toBe('asset') // visual choices kept in order
  })
  it('falls back without an AI answer: script sentences, uploads in order', () => {
    const p = parsePlan(null, { script: 'Bir. İki. Üç.', topic: '', assets }, nid)
    expect(p.source).toBe('fallback')
    expect(p.scenes.map((s) => s.visual.kind)).toEqual(['asset', 'asset', 'ai'])
  })
  it('drops section-name labels the AI invents', () => {
    const p = parsePlan(JSON.stringify({ scenes: [{ text: 'Bir iki.', label: 'Giriş' }, { text: 'Üç dört.', label: 'Kapanış' }, { text: 'Beş altı.', label: '1871' }] }), { script: '', topic: 't', assets: [] }, nid)
    expect(p.scenes.map((s) => s.label)).toEqual([null, null, '1871'])
  })
  it('survives fenced / chatty JSON', () => {
    const p = parsePlan('Tabii!\n```json\n{"scenes":[{"text":"Merhaba dünya.","asset":null,"prompt":"a"}]}\n```', { script: '', topic: 't', assets: [] }, nid)
    expect(p.scenes[0].text).toBe('Merhaba dünya.')
  })
})

describe('parseScenes', () => {
  const assets = [asset('a1'), asset('v1', 'video', { durationMs: 10_000 })]
  it('keeps a generated image only while the prompt is unchanged', () => {
    const prev: StoryScene[] = [{ id: 'sc0001', text: 'x y', highlights: [], label: null, keepAudio: false, reason: null, need: null, visual: { kind: 'ai', prompt: 'old', imagePath: 'p', imageUrl: 'u', imageKey: 'k', error: null } }]
    const same = parseScenes([{ id: 'sc0001', text: 'x y', visual: { kind: 'ai', prompt: 'old', imagePath: 'HACK' } }], assets, prev)
    expect(same.ok && same.value[0].visual).toMatchObject({ imagePath: 'p', imageKey: 'k' }) // server-owned fields not taken from client
    const changed = parseScenes([{ id: 'sc0001', text: 'x y', visual: { kind: 'ai', prompt: 'new' } }], assets, prev)
    expect(changed.ok && changed.value[0].visual).toMatchObject({ imagePath: null, imageKey: null })
  })
  it('clamps the video offset and drops keepAudio on photos', () => {
    const r = parseScenes([
      { id: 'sc0002', text: 'a b', keepAudio: true, visual: { kind: 'asset', assetId: 'v1', offsetMs: 99_000 } },
      { id: 'sc0003', text: 'c d', keepAudio: true, visual: { kind: 'asset', assetId: 'a1' } },
    ], assets, [])
    expect(r.ok && r.value[0].visual).toEqual({ kind: 'asset', assetId: 'v1', offsetMs: 9000 })
    expect(r.ok && r.value[0].keepAudio).toBe(true)
    expect(r.ok && r.value[1].keepAudio).toBe(false)
  })
  it('rejects missing assets and duplicate ids', () => {
    expect(parseScenes([{ id: 'sc0004', text: 'a b', visual: { kind: 'asset', assetId: 'nope' } }], assets, []).ok).toBe(false)
    expect(parseScenes([{ id: 'sc0005', text: 'a b' }, { id: 'sc0005', text: 'c d' }], assets, []).ok).toBe(false)
  })
})

describe('render readiness and keys', () => {
  const base = (): Pick<StoryProject, 'scenes' | 'style' | 'assets' | 'seriesLabel' | 'rights'> => ({
    style: 'paper', seriesLabel: 'NaHaber', rights, assets: [asset('a1')],
    scenes: [
      { id: 's1', text: 'Bir iki üç.', highlights: [], label: null, keepAudio: false, reason: null, need: null, visual: { kind: 'asset', assetId: 'a1', offsetMs: 0 } },
      { id: 's2', text: 'Dört beş altı.', highlights: [], label: null, keepAudio: false, reason: null, need: null, visual: { kind: 'ai', prompt: 'p', imagePath: null, imageUrl: null, imageKey: null, error: null } },
    ],
  })
  it('asks for illustrations first', () => {
    const p = base()
    expect(missingImages(p)).toHaveLength(1)
    expect(renderProblem(p)).toMatch(/çizim/)
    const s = p.scenes[1].visual
    if (s.kind === 'ai') Object.assign(s, { imagePath: 'x', imageKey: imageKeyFor('p', 'paper') })
    expect(renderProblem(p)).toBeNull()
    // a style change makes the illustration stale
    expect(missingImages({ ...p, style: 'dark' })).toHaveLength(1)
  })
  it('render key changes with the text', () => {
    const a = base()
    const b = base()
    b.scenes[0].text = 'Değişti.'
    expect(renderKeyFor(a)).not.toBe(renderKeyFor(b))
    expect(renderKeyFor(a)).toBe(renderKeyFor(base()))
  })
  it('refuses videos over the Reels limit', () => {
    const p = base()
    p.scenes = Array.from({ length: 14 }, (_, i) => ({ ...p.scenes[0], id: `s${i}`, text: 'x'.repeat(150) }))
    expect(renderProblem(p)).toMatch(/en fazla/)
    expect(estimateSeconds(p.scenes)).toBeGreaterThan(88)
  })
})

describe('timeline', () => {
  it('places scenes with the cross-fade overlap and narration after the lead', () => {
    const tl = buildTimeline([{ text: 'Bir iki üç dört.', highlights: [] }, { text: 'Beş altı yedi.', highlights: ['altı'] }], [2, 3])
    const lens = segmentLengths([2, 3])
    expect(tl.scenes[1].start).toBeCloseTo(lens[0] - XF)
    expect(tl.total).toBeCloseTo(lens[0] - XF + lens[1])
    expect(tl.scenes[1].voiceStart).toBeCloseTo(tl.scenes[1].start + 0.15)
    expect(xfadeOffsets(lens)[1]).toBeCloseTo(tl.scenes[1].start)
    const w = tl.scenes[1].chunks[0].words
    expect(w.find((x) => x.word === 'altı')?.highlight).toBe(true)
    expect(w.every((x, i) => i === 0 || x.start > w[i - 1].start)).toBe(true)
  })
  it('chunks long sentences into readable pieces', () => {
    const c = captionChunks('Toprağın altından üst üste kurulmuş dokuz ana şehir katmanı çıktı ve hepsi farklı dönemlere ait.', [], 0, 6)
    expect(c.length).toBeGreaterThan(1)
    expect(c.every((x) => x.words.map((w) => w.word).join(' ').length <= 48)).toBe(true)
  })
  it('overlay states cover the whole video and change word by word', () => {
    const tl = buildTimeline([{ text: 'Truva Atı gerçekten var mıydı?', highlights: ['Truva'] }, { text: 'Kazılar 1871 yılında başladı.', highlights: [] }], [2, 2.5])
    const states = overlayStates(tl)
    const sum = states.reduce((a, s) => a + s.duration, 0)
    expect(sum).toBeCloseTo(tl.total, 3)
    expect(stateAt(tl, tl.scenes[0].voiceStart + 1.9)?.spoken).toBe(5)
    expect(stateAt(tl, tl.scenes[1].start + 0.01)?.scene).toBe(1)
    expect(states.length).toBeLessThan(80)
  })
})

describe('ffmpeg argv', () => {
  it('builds segments with matching stream parameters', () => {
    const s = stillSegmentArgs({ image: 'i.jpg', output: 'o.mp4', seconds: 3, index: 1 })
    expect(s.join(' ')).toContain('crop=1080:1920')
    expect(s).toContain('anullsrc=channel_layout=stereo:sample_rate=48000')
    const v = videoSegmentArgs({ input: 'v.mp4', output: 'o.mp4', seconds: 3, offsetSec: 2, keepAudio: true, hasAudio: false })
    expect(v.join(' ')).not.toContain('[0:a]') // no audio track → silence
    expect(videoSegmentArgs({ input: 'v.mp4', output: 'o.mp4', seconds: 3, offsetSec: 2, keepAudio: true, hasAudio: true }).join(' ')).toContain('volume=0.18')
  })
  it('bakes the cross-fade into each segment head and reads segments sequentially', () => {
    const first = joinArgs({ prev: null, prevLen: 0, cur: 's0.mp4', curLen: 3, last: false, output: 'j0.mp4' })
    expect(first).toContain('copy')
    expect(first[first.indexOf('-t') + 1]).toBe('2.600')
    const mid = joinArgs({ prev: 's0.mp4', prevLen: 3, cur: 's1.mp4', curLen: 4, last: false, output: 'j1.mp4' })
    expect(mid[mid.indexOf('-ss') + 1]).toBe('2.600')
    expect(mid.join(' ')).toContain('xfade=transition=fade:duration=0.4:offset=0,trim=duration=3.600')
    const last = joinArgs({ prev: 's1.mp4', prevLen: 4, cur: 's2.mp4', curLen: 5, last: true, output: 'j2.mp4' })
    expect(last.join(' ')).toContain('trim=duration=5.000')
    const f = finalArgs({ segmentList: 'seg.txt', narration: 'n.wav', overlayList: 'o.txt', output: 'out.mp4', total: 11.2 })
    const fc = f[f.indexOf('-filter_complex') + 1]
    expect(fc).not.toContain('xfade')
    expect(f.filter((x) => x === 'concat')).toHaveLength(2)
    expect(fc).toContain('amix=inputs=2')
    expect(fc).not.toContain('[wm]')
    const fw = finalArgs({ segmentList: 'seg.txt', narration: 'n.wav', overlayList: 'o.txt', output: 'out.mp4', total: 11.2, watermark: 'wm.png' })
    const fcw = fw[fw.indexOf('-filter_complex') + 1]
    expect(fcw).toContain('colorchannelmixer=aa=0.16')
    expect(fcw.indexOf('[wm]')).toBeLessThan(fcw.indexOf('[base][ovl]'))
    expect(segmentConcat(['/t/a.mp4'])).toContain("file '/t/a.mp4'")
  })
  it('writes a concat list that holds the last state', () => {
    const c = overlayConcat([{ file: '/t/a.png', duration: 1 }, { file: "/t/b'.png", duration: 2 }])
    expect(c.split('\n').filter((l) => l.startsWith('file'))).toHaveLength(3)
    expect(c).toContain("b'\\''.png")
  })
})

describe('storyCaption', () => {
  it('marks AI illustrations and credits footage we do not own', () => {
    const c = storyCaption({
      caption: 'Truva gerçek mi?', title: 't', rights: { kind: 'partner', sourceName: 'DHA', note: null }, assets: [asset('a1')],
      scenes: [
        { id: 's1', text: 'a', highlights: [], label: null, keepAudio: false, reason: null, need: null, visual: { kind: 'asset', assetId: 'a1', offsetMs: 0 } },
        { id: 's2', text: 'b', highlights: [], label: null, keepAudio: false, reason: null, need: null, visual: { kind: 'ai', prompt: 'p', imagePath: 'x', imageUrl: null, imageKey: null, error: null } },
      ],
    })
    expect(c).toContain('Kaynak: DHA')
    expect(c).toContain('yapay zekâ')
  })
})

describe('contentBox (blank paper trim)', () => {
  it('trims flat bottom and left margins, keeps content', async () => {
    const { contentBox } = await import('./storyOverlay')
    const w = 40
    const h = 80
    const lum = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lum[y * w + x] = y < 50 && x >= 4 ? ((x * 37 + y * 91) % 200) : 230
    expect(contentBox(lum, w, h)).toEqual({ x0: 4, y0: 0, x1: 40, y1: 50 })
  })
})

describe('long videos and formats', () => {
  it('parses format and target length with defaults', () => {
    const a = parseMeta({ topic: 'Truva', rights })
    expect(a.ok && a.value.format).toBe('vertical')
    expect(a.ok && a.value.targetMin).toBe(1)
    const b = parseMeta({ topic: 'Truva', rights, format: 'horizontal', targetMin: 10 })
    expect(b.ok && b.value.format).toBe('horizontal')
    expect(b.ok && b.value.targetMin).toBe(10)
  })
  it('long plans never ask for AI drawings: missing pictures become text cards with a shot-list note', () => {
    const raw = JSON.stringify({ title: 'T', caption: 'c', scenes: [
      { text: 'Birinci cümle burada.', asset: 'a1', need: null },
      { text: 'İkinci cümle burada.', asset: null, prompt: 'x', need: 'Kazı alanı fotoğrafı' },
      { text: 'Üçüncü cümle burada.', asset: 'a1', offsetSec: 0 },
    ] })
    const plan = parsePlan(raw, { script: '', topic: 't', assets: [asset('a1')], targetMin: 5 }, nid)
    expect(plan.scenes.map((s) => s.visual.kind)).toEqual(['asset', 'card', 'asset'])
    expect(plan.scenes[1].need).toBe('Kazı alanı fotoğrafı')
    expect(shotList(plan)).toHaveLength(1)
  })
  it('short plans keep AI drawings', () => {
    const raw = JSON.stringify({ scenes: [{ text: 'Bir cümle.', asset: null, prompt: 'a city' }, { text: 'İki cümle.', asset: null }] })
    const plan = parsePlan(raw, { script: '', topic: 't', assets: [], targetMin: 1 }, nid)
    expect(plan.scenes.every((s) => s.visual.kind === 'ai')).toBe(true)
  })
  it('renderProblem rejects AI drawings in long videos and uses the target limit', () => {
    const scenes = [0, 1].map((i) => ({ id: `s${i}aaa`, text: 'Kısa cümle.', highlights: [], label: null, visual: { kind: 'ai' as const, prompt: 'x', imagePath: 'p', imageUrl: 'u', imageKey: imageKeyFor('x', 'paper'), error: null }, keepAudio: false, reason: null, need: null }))
    expect(renderProblem({ scenes, style: 'paper', assets: [], targetMin: 3 })).toMatch(/AI çizimi/)
    expect(renderProblem({ scenes, style: 'paper', assets: [], targetMin: 1 })).toBeNull()
    const cards = scenes.map((s) => ({ ...s, visual: { kind: 'card' as const } }))
    expect(renderProblem({ scenes: cards, style: 'paper', assets: [], targetMin: 3 })).toBeNull()
  })
  it('the render key changes with the format', () => {
    const p = { scenes: [], style: 'paper' as const, seriesLabel: 'N', rights, assets: [] }
    expect(renderKeyFor({ ...p, format: 'vertical' })).not.toBe(renderKeyFor({ ...p, format: 'horizontal' }))
  })
  it('chunkRanges covers every scene once, in ≈ target-sized parts', () => {
    const scenes = Array.from({ length: 70 }, () => ({ text: 'Bu bir uzun anlatım cümlesidir ve yaklaşık yedi saniye sürer, belki biraz daha.' }))
    const r = chunkRanges(scenes, 45)
    expect(r[0][0]).toBe(0)
    expect(r[r.length - 1][1]).toBe(70)
    for (let i = 1; i < r.length; i++) expect(r[i][0]).toBe(r[i - 1][1])
    expect(r.length).toBeGreaterThan(5)
  })
  it('horizontal frame and illustration prompt', () => {
    expect(FRAMES.horizontal.w).toBe(1920)
    expect(illustrationPrompt('a ship', 'paper', 'horizontal')).toMatch(/16:9/)
    expect(illustrationPrompt('a ship', 'paper')).toMatch(/9:16/)
  })
})

describe('part slicing', () => {
  it('parts join back into the whole timeline', async () => {
    const { sliceTimeline } = await import('./storyCompose')
    const sc = Array.from({ length: 6 }, (_, i) => ({ text: `Sahne ${i} için kısa bir anlatım cümlesi.`, highlights: [] }))
    const tl = buildTimeline(sc, [3, 2.5, 4, 3, 2, 3.5])
    const a = sliceTimeline(tl, 0, 3)
    const b = sliceTimeline(tl, 3, 6)
    expect(a.t0).toBe(0)
    expect(a.t1).toBeCloseTo(b.t0, 6)
    expect(a.timeline.total + b.timeline.total).toBeCloseTo(tl.total, 6)
    expect(b.timeline.scenes[0].start).toBeCloseTo(0, 6)
  })
})
