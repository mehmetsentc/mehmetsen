import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { extrasMixArgs, fxEvents, readPcm16Wav, resample, silentWav, synthPop, FX_RATE } from './storyAudio'

function wav(samples: number[], rate = 44100): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2)
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8, 'ascii')
  b.write('fmt ', 12, 'ascii'); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36, 'ascii'); b.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((s, i) => b.writeInt16LE(s, 44 + i * 2))
  return b
}

describe('storyAudio (Görev 45)', () => {
  it('reads PCM16 WAV and resamples to 48 kHz', () => {
    const w = readPcm16Wav(wav([0, 16384, -16384, 0]))
    expect(w.rate).toBe(44100)
    expect(w.samples[1]).toBeCloseTo(0.5, 3)
    expect(resample(new Float32Array(44100), 44100).length).toBe(FX_RATE)
  })
  it('pop is short and bounded', () => {
    const p = synthPop()
    expect(p.length).toBeLessThan(FX_RATE / 4)
    expect(Math.max(...Array.from(p).map(Math.abs))).toBeLessThanOrEqual(0.5)
  })
  it('a whoosh per scene, a pop where a headline / label pops, a ding at the very start', () => {
    const tl = { total: 10, scenes: [{ start: 0, labelAt: 0.4 }, { start: 4, labelAt: 4.4 }] } as never
    const ev = fxEvents(tl, [true, false])
    expect(ev.filter((e) => e.sound.startsWith('whoosh'))).toHaveLength(2)
    expect(ev.filter((e) => e.sound === 'pop').map((e) => e.at)).toEqual([0.4])
    expect(ev.some((e) => e.sound === 'ding')).toBe(true)
  })
  it('closing card: outro sting instead of a whoosh, no pop', () => {
    const tl = { total: 12, scenes: [{ start: 0, labelAt: 0.4 }, { start: 9, labelAt: 9.4 }] } as never
    const ev = fxEvents(tl, [true, false], 1)
    expect(ev.filter((e) => e.sound === 'outro').map((e) => e.at)).toEqual([9])
    expect(ev.filter((e) => e.at === 9 && e.sound.startsWith('whoosh'))).toHaveLength(0)
  })
  it('silent WAV has the right length', () => {
    const w = readPcm16Wav(silentWav(2, 24000))
    expect(w.samples.length).toBe(48000)
  })
  it('mix argv: ducked bed continues from the part offset; no bed → narration key is consumed', () => {
    const a = extrasMixArgs({ narration: 'n.wav', fx: 'fx.wav', bed: 'bed.m4a', bedOffset: 45.5, total: 30, output: 'o.wav' })
    expect(a.join(' ')).toMatch(/-stream_loop -1 -ss 45\.500 -i bed\.m4a/)
    expect(a.join(' ')).toMatch(/sidechaincompress/)
    expect(a.join(' ')).toMatch(/amix=inputs=3/)
    const b = extrasMixArgs({ narration: 'n.wav', fx: 'fx.wav', bed: null, bedOffset: 0, total: 30, output: 'o.wav' })
    expect(b.join(' ')).toMatch(/anullsink/)
    expect(b.join(' ')).toMatch(/amix=inputs=2/)
  })
})
