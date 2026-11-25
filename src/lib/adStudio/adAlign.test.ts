import { describe, expect, it } from 'vitest'
import { alignScenes, analyzeVoice } from './adAlign'

/** konuşma (ton) ve sessizlik parçalarından sahte ses */
function fake(parts: Array<[ 'ses' | 'sus', number ]>, sr = 24000): Float32Array {
  const total = parts.reduce((a, [, ms]) => a + ms, 0)
  const d = new Float32Array(Math.round((total * sr) / 1000))
  let i = 0
  for (const [k, ms] of parts) {
    const n = Math.round((ms * sr) / 1000)
    for (let j = 0; j < n; j++, i++) d[i] = k === 'ses' ? 0.3 * Math.sin((2 * Math.PI * 180 * i) / sr) : (Math.random() - 0.5) * 0.002
  }
  return d
}

describe('yazıları sese eşleme', () => {
  const pcm = fake([['sus', 500], ['ses', 3000], ['sus', 700], ['ses', 6000], ['sus', 900], ['ses', 2000], ['sus', 400]])
  const t = analyzeVoice(pcm, 24000)

  it('konuşma başı/sonu ve duraklamalar bulunur', () => {
    expect(t.speechStartMs).toBeGreaterThanOrEqual(480)
    expect(t.speechStartMs).toBeLessThanOrEqual(520)
    expect(Math.abs(t.speechEndMs - 13100)).toBeLessThan(60)
    expect(t.pauses).toHaveLength(2)
    expect(Math.abs(t.pauses[0]!.at - 3850)).toBeLessThan(40)
    expect(Math.abs(t.pauses[1]!.at - 10650)).toBeLessThan(40)
  })

  it('yazı sınırları gerçek duraklamalara oturur (metin oranı tutmasa da)', () => {
    // 1. ve 3. yazı aynı uzunlukta ama sesleri 3 sn / 2 sn — oran tahmini kayar, duraklama düzeltir
    const sc = alignScenes([{ text: 'Biga’dan doğan güven' }, { text: 'Yılların tecrübesi ve güçlü üretim altyapısıyla hizmetinizdeyiz' }, { text: 'Öztürk Temper Cam!' }], t, 600, 60_000)
    expect(sc).toHaveLength(3)
    expect(Math.abs(sc[0]!.startMs - (600 + 500 - 150))).toBeLessThan(40)
    expect(Math.abs(sc[1]!.startMs - (600 + 3850 - 150))).toBeLessThan(80)
    expect(Math.abs(sc[2]!.startMs - (600 + 10650 - 150))).toBeLessThan(80)
    expect(sc[0]!.endMs).toBeLessThanOrEqual(sc[1]!.startMs)
  })

  it('firma kartından sonra yazı kalmaz', () => {
    const sc = alignScenes([{ text: 'Bir' }, { text: 'İki' }, { text: 'Üç' }], t, 0, 8000)
    expect(sc.every((s) => s.endMs <= 8000)).toBe(true)
  })
})
