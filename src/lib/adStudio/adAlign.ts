/**
 * REKLAM STÜDYOSU — ekrandaki yazıları seslendirmeyle eşleştirme (saf; ses dosyası analizi + zamanlama).
 * Seslendirmedeki konuşma başı/sonu ve duraklamalar (cümle sonu, «…», virgül) bulunur; her yazının
 * sınırı metindeki konumuna göre tahmin edilip en yakın duraklamaya oturtulur.
 */
import { newItemId } from '@/lib/edit/editProject'
import type { AdScene } from './adModel'

export type VoiceTiming = {
  /** ses dosyasının içinde, ms */
  speechStartMs: number
  speechEndMs: number
  /** duraklamaların ortası ve uzunluğu (ms) */
  pauses: Array<{ at: number; len: number }>
}

const FRAME_MS = 20

/** PCM (−1..1) içinde konuşma ve duraklamaları bulur. */
export function analyzeVoice(data: Float32Array, sampleRate: number): VoiceTiming {
  const n = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000))
  const frames = Math.floor(data.length / n)
  const rms = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let s = 0
    for (let i = f * n; i < (f + 1) * n; i++) s += data[i]! * data[i]!
    rms[f] = Math.sqrt(s / n)
  }
  const sorted = Array.from(rms).sort((a, b) => a - b)
  const loud = sorted[Math.floor(sorted.length * 0.95)] ?? 0
  const thr = Math.max(0.004, loud * 0.06) // ~ −24 dB altı sessiz
  const speech = Array.from(rms, (v) => v > thr)
  const first = speech.indexOf(true)
  const last = speech.lastIndexOf(true)
  if (first < 0) return { speechStartMs: 0, speechEndMs: frames * FRAME_MS, pauses: [] }
  const pauses: Array<{ at: number; len: number }> = []
  let run = 0
  for (let f = first; f <= last; f++) {
    if (!speech[f]) run++
    else {
      if (run * FRAME_MS >= 160) pauses.push({ at: (f - run / 2) * FRAME_MS, len: run * FRAME_MS })
      run = 0
    }
  }
  return { speechStartMs: first * FRAME_MS, speechEndMs: (last + 1) * FRAME_MS, pauses }
}

/** okunan uzunluk (noktalama sayılmaz) */
const weight = (s: string) => Math.max(4, s.replace(/[^\p{L}\p{N}]/gu, '').length)

/**
 * Yazıları sese göre zamanlar. `texts` sıralı sahne yazıları (kullanıcının düzenlediği hâli),
 * `offsetMs` seslendirmenin videodaki başlangıcı, `limitMs` yazıların bitmesi gereken an (firma kartı).
 */
export function alignScenes(texts: Array<{ text: string; emphasis?: string; id?: string }>, t: VoiceTiming, offsetMs: number, limitMs: number): AdScene[] {
  if (!texts.length) return []
  const span = Math.max(1, t.speechEndMs - t.speechStartMs)
  const w = texts.map((x) => weight(x.text))
  const total = w.reduce((a, b) => a + b, 0)
  const free = [...t.pauses]
  const bounds: number[] = [t.speechStartMs]
  let cum = 0
  for (let i = 1; i < texts.length; i++) {
    cum += w[i - 1]!
    const guess = t.speechStartMs + (cum / total) * span
    const prev = bounds[i - 1]!
    // en yakın (uzun olanı yeğle) duraklama, ±1,6 sn içinde ve öncekinden en az 0,5 sn sonra
    let best = -1
    let score = Infinity
    free.forEach((p, k) => {
      const d = Math.abs(p.at - guess)
      if (d > 1600 || p.at < prev + 500) return
      const sc = d - Math.min(p.len, 800) * 0.6
      if (sc < score) {
        score = sc
        best = k
      }
    })
    const at = best >= 0 ? free.splice(best, 1)[0]!.at : Math.max(guess, prev + 500)
    bounds.push(at)
  }
  bounds.push(t.speechEndMs)
  const out: AdScene[] = []
  for (let i = 0; i < texts.length; i++) {
    // yazı sesin hemen önünde görünür (150 ms), bir sonrakine kadar ekranda kalır
    const start = Math.max(0, Math.round(offsetMs + bounds[i]! - 150))
    let end = Math.round(offsetMs + bounds[i + 1]! - (i < texts.length - 1 ? 150 : -400))
    end = Math.min(end, limitMs)
    if (start >= limitMs || end - start < 300) continue
    out.push({ id: texts[i]!.id ?? newItemId(), text: texts[i]!.text, startMs: start, endMs: end, emphasis: texts[i]!.emphasis ?? '' })
  }
  return out
}
