import { describe, expect, it } from 'vitest'
import { clipEditArgs, frameSize, bitrateForCap } from './clipEdit'
import { clipRenderKey, clipSeconds, keptRanges, parseClipInput, parseClipOptions, DEFAULT_CLIP_OPTIONS } from './mediaProject'

describe('VIDEO-KES — kesme, bölme, biçim, boyut', () => {
  it('ortadan çıkarılan aralıklar: kalan parçalar ve süre', () => {
    const c = { startMs: 2000, endMs: 30000, cuts: [{ startMs: 5000, endMs: 12000 }, { startMs: 20000, endMs: 25000 }] }
    expect(keptRanges(c)).toEqual([{ startMs: 2000, endMs: 5000 }, { startMs: 12000, endMs: 20000 }, { startMs: 25000, endMs: 30000 }])
    expect(clipSeconds(c)).toBe(16)
    expect(clipSeconds({ startMs: 0, endMs: 9000 })).toBe(9)
  })
  it('aralık 3 dakikayı aşabilir; kalan süre 3 dakikayı aşamaz', () => {
    const base = { id: 'abcd1234', name: 'P', title: '', options: {} }
    expect(parseClipInput({ ...base, startMs: 0, endMs: 400_000 }, 600_000).ok).toBe(false)
    const ok = parseClipInput({ ...base, startMs: 0, endMs: 400_000, cuts: [{ startMs: 60_000, endMs: 300_000 }] }, 600_000)
    expect(ok.ok && ok.value.cuts).toEqual([{ startMs: 60_000, endMs: 300_000 }])
    expect(parseClipInput({ ...base, startMs: 0, endMs: 10_000, cuts: [{ startMs: 9_000, endMs: 12_000 }] }, 600_000).ok).toBe(false)
    expect(parseClipInput({ ...base, startMs: 0, endMs: 40 * 60_000, cuts: [{ startMs: 1000, endMs: 39 * 60_000 }] }, 3_600_000).ok).toBe(false)
  })
  it('biçim seçenekleri; NaHaber yazı düzeni yalnız 9:16 bulanıkta', () => {
    expect(parseClipOptions({ frame: 'square', fit: 'crop', cropX: 0, showTitle: true })).toEqual({ frame: 'square', fit: 'crop', cropX: 0, showTitle: false, showLogo: false, showSource: false, mute: false })
    expect(parseClipOptions({ frame: 'vertical' })).toEqual(DEFAULT_CLIP_OPTIONS)
    expect(parseClipOptions({ frame: 'landscape', quality: '720', maxMb: 9999 })).toMatchObject({ frame: 'landscape', quality: '720', maxMb: 500 })
    expect(frameSize({ frame: 'portrait45', quality: '720' })).toEqual([720, 900])
    expect(frameSize({ frame: 'original' })).toBeNull()
  })
  it('eski parçaların üretim anahtarı değişmez (yeniden üretim gerekmez)', () => {
    const clip = { startMs: 0, endMs: 5000, title: 'T', options: { ...DEFAULT_CLIP_OPTIONS } }
    const k1 = clipRenderKey('vid1', clip, null)
    expect(clipRenderKey('vid1', { ...clip, cuts: [] }, null)).toBe(k1)
    expect(clipRenderKey('vid1', { ...clip, cuts: [{ startMs: 1000, endMs: 2000 }] }, null)).not.toBe(k1)
    expect(clipRenderKey('vid1', { ...clip, options: { ...clip.options, quality: '720' } }, null)).not.toBe(k1)
  })
  it('ffmpeg: her kalan parça ayrı hızlı arama girdisi, kare kırpma, boyut sınırı', () => {
    const args = clipEditArgs({ input: '/t/in', output: '/t/o.mp4', startMs: 2000, endMs: 30000, cuts: [{ startMs: 5000, endMs: 12000 }], options: parseClipOptions({ frame: 'square', fit: 'crop', maxMb: 10 }), overlay: null, outro: { image: '/t/oj.jpg', sting: null, hasAudio: true }, hasAudio: true })
    expect(args.filter((a) => a === '/t/in')).toHaveLength(2)
    const fc = args[args.indexOf('-filter_complex') + 1]!
    expect(fc).toContain('concat=n=2:v=1:a=1[jv][ja]')
    expect(fc).toContain('crop=1080:1080')
    expect(args).toContain('-b:v')
    expect(args).not.toContain('-crf')
    expect(bitrateForCap(10, 23.6)).toBeGreaterThan(3_000_000)
  })
})
