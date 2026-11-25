import { describe, expect, it } from 'vitest'
import { planTempo, stretchPauses, TEMPO_MAX, TEMPO_MIN } from './adFit'

function speech(parts: Array<['ses' | 'sus', number]>, sr = 24000): Float32Array {
  const total = parts.reduce((a, [, ms]) => a + ms, 0)
  const d = new Float32Array(Math.round((total * sr) / 1000))
  let i = 0
  for (const [k, ms] of parts) for (let j = 0; j < Math.round((ms * sr) / 1000); j++, i++) d[i] = k === 'ses' ? 0.3 * Math.sin((2 * Math.PI * 180 * i) / sr) : 0
  return d
}

describe('sesi videoya uydurma', () => {
  it('hız sınırlı: çok kısa ses en fazla %90, uzun ses en fazla %112', () => {
    expect(planTempo(58_000, 74_000)).toBe(TEMPO_MIN)
    expect(planTempo(100_000, 74_000)).toBe(TEMPO_MAX)
    expect(planTempo(72_000, 74_000)).toBeLessThanOrEqual(1)
  })
  it('kalan süre cümle aralarına dağıtılır, konuşma sesleri bozulmaz', () => {
    const sr = 24000
    const d = speech([['sus', 300], ['ses', 4000], ['sus', 600], ['ses', 4000], ['sus', 400], ['ses', 3000], ['sus', 300]])
    const r = stretchPauses(d, sr, 16_000)
    expect(r.addedMs).toBeGreaterThan(2500)
    expect(Math.abs((r.data.length / sr) * 1000 - (12_600 + r.addedMs))).toBeLessThan(5)
    // her araya en fazla 2,5 sn
    expect(r.addedMs).toBeLessThanOrEqual(5000)
  })
  it('hedef kısaysa dokunmaz', () => {
    const d = speech([['ses', 3000]])
    expect(stretchPauses(d, 24000, 2000).addedMs).toBe(0)
  })
})
