/**
 * REKLAM STÜDYOSU — seslendirmeyi video süresine uydurma (yeni ücretli ses üretmeden).
 *   1. Hız: %90–112 arası (atempo; ses perdesi değişmez). Daha fazlası doğal duyulmaz.
 *   2. Kalan süre cümle aralarına (duraklamalara) dağıtılır: uzun duraklama daha çok pay alır,
 *      bir araya en fazla 2,5 sn eklenir. Reklam seslendirmesinde doğal olan budur.
 * Saf hesap (planFit / stretchPauses) + ffmpeg atempo (applyTempo, yalnız sunucu).
 */
import { analyzeVoice } from './adAlign'

export const TEMPO_MIN = 0.9
export const TEMPO_MAX = 1.12
const PAUSE_CAP_MS = 2500

export function planTempo(durationMs: number, targetMs: number): number {
  if (!durationMs || !targetMs) return 1
  const k = durationMs / targetMs
  if (k > 1) return Math.min(TEMPO_MAX, k)
  return Math.max(TEMPO_MIN, Math.min(1, k * 1.04)) // biraz yavaşlat, kalanı duraklamalara
}

/** Duraklamalara sessizlik ekleyerek PCM'i hedef süreye yaklaştırır. */
export function stretchPauses(data: Float32Array, sampleRate: number, targetMs: number): { data: Float32Array; addedMs: number } {
  const curMs = (data.length / sampleRate) * 1000
  let need = targetMs - curMs
  if (need < 200) return { data, addedMs: 0 }
  const t = analyzeVoice(data, sampleRate)
  const pauses = t.pauses.filter((p) => p.len >= 200)
  if (!pauses.length) return { data, addedMs: 0 }
  const weights = pauses.map((p) => Math.min(p.len, 900))
  const sum = weights.reduce((a, b) => a + b, 0)
  const add = pauses.map((_, i) => Math.min(PAUSE_CAP_MS, (need * weights[i]!) / sum))
  const total = add.reduce((a, b) => a + b, 0)
  need = total
  const extra = Math.round((total / 1000) * sampleRate)
  const out = new Float32Array(data.length + extra)
  let src = 0
  let dst = 0
  pauses.forEach((p, i) => {
    const at = Math.min(data.length, Math.round((p.at / 1000) * sampleRate))
    out.set(data.subarray(src, at), dst)
    dst += at - src
    src = at
    dst += Math.round((add[i]! / 1000) * sampleRate) // sessizlik (sıfır)
  })
  out.set(data.subarray(src), dst)
  dst += data.length - src
  return { data: out.subarray(0, dst), addedMs: Math.round(need) }
}
