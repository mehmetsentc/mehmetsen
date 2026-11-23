import 'server-only'

/**
 * GÖREV 45 — «Bilgi animasyonu» sound: effects on scene changes and headline pops, and a
 * music bed that ducks under the narration. Effects are mixed in JS (tiny), the bed and the
 * final mix go through ffmpeg (argv only, no shell).
 *
 * Assets: the existing licensed broadcast set (src/lib/reels/assets/audio/broadcast):
 * whoosh-up / whoosh-down WAVs and bed-<name>.m4a. «pop» and «ding» are synthesised.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { StoryMusic, StoryTimeline } from './storyProject'

export const FX_RATE = 48000

/** PCM16 WAV → mono float samples at its own rate (only what the bundled assets use). */
export function readPcm16Wav(buf: Buffer): { samples: Float32Array; rate: number } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('wav: not RIFF/WAVE')
  let off = 12
  let channels = 1
  let rate = 44100
  let bits = 16
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    const body = off + 8
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2)
      rate = buf.readUInt32LE(body + 4)
      bits = buf.readUInt16LE(body + 14)
    } else if (id === 'data') {
      if (bits !== 16) throw new Error('wav: only PCM16')
      const n = Math.floor(Math.min(size, buf.length - body) / (2 * channels))
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        let v = 0
        for (let c = 0; c < channels; c++) v += buf.readInt16LE(body + (i * channels + c) * 2)
        out[i] = v / channels / 32768
      }
      return { samples: out, rate }
    }
    off = body + size + (size % 2)
  }
  throw new Error('wav: no data chunk')
}

/** Linear resample to FX_RATE. */
export function resample(src: Float32Array, rate: number): Float32Array {
  if (rate === FX_RATE) return src
  const n = Math.floor((src.length * FX_RATE) / rate)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * rate) / FX_RATE
    const a = Math.floor(x)
    const f = x - a
    out[i] = (src[a] ?? 0) * (1 - f) + (src[a + 1] ?? 0) * f
  }
  return out
}

/** Short «pop»: a fast downward sine chirp. */
export function synthPop(): Float32Array {
  const n = Math.round(0.12 * FX_RATE)
  const out = new Float32Array(n)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / FX_RATE
    const f = 300 + 900 * Math.exp(-t * 25)
    ph += (2 * Math.PI * f) / FX_RATE
    out[i] = 0.5 * Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t / 0.035)
  }
  return out
}

/** Soft «ding» for the first scene / closing. */
export function synthDing(): Float32Array {
  const n = Math.round(0.9 * FX_RATE)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / FX_RATE
    const e = Math.min(1, t / 0.003) * Math.exp(-t / 0.25)
    out[i] = 0.26 * e * (Math.sin(2 * Math.PI * 1320 * t) + 0.4 * Math.sin(2 * Math.PI * 2640 * t) + 0.15 * Math.sin(2 * Math.PI * 3960 * t))
  }
  return out
}

export type FxEvent = { at: number; sound: 'whoosh' | 'whoosh2' | 'pop' | 'ding'; gain: number }

/** Where the effects go: a whoosh on every scene change, a pop when a headline / label pops in. */
export function fxEvents(tl: StoryTimeline, pops: boolean[]): FxEvent[] {
  const out: FxEvent[] = []
  tl.scenes.forEach((s, k) => {
    out.push({ at: Math.max(0, s.start), sound: k % 2 ? 'whoosh2' : 'whoosh', gain: 0.5 })
    if (pops[k]) out.push({ at: Math.max(0, s.labelAt), sound: 'pop', gain: 0.9 })
  })
  if (tl.scenes.length && tl.scenes[0].start === 0) out.push({ at: 0.05, sound: 'ding', gain: 0.6 })
  return out.sort((a, b) => a.at - b.at)
}

/** Mixes the effects into one PCM16 stereo WAV of `total` seconds. */
export async function buildFxWav(events: FxEvent[], total: number, root: string): Promise<Buffer> {
  const dir = path.join(root, 'src/lib/reels/assets/audio/broadcast')
  const load = async (f: string) => {
    const w = readPcm16Wav(await fs.readFile(path.join(dir, f)))
    return resample(w.samples, w.rate)
  }
  const sounds: Record<FxEvent['sound'], Float32Array> = {
    whoosh: await load('whoosh-up.wav'),
    whoosh2: await load('whoosh-down.wav'),
    pop: synthPop(),
    ding: synthDing(),
  }
  const n = Math.max(1, Math.round(total * FX_RATE))
  const mix = new Float32Array(n)
  for (const e of events) {
    const src = sounds[e.sound]
    const at = Math.round(e.at * FX_RATE)
    for (let i = 0; i < src.length && at + i < n; i++) mix[at + i] += src[i] * e.gain
  }
  const buf = Buffer.alloc(44 + n * 4)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + n * 4, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(FX_RATE, 24)
  buf.writeUInt32LE(FX_RATE * 4, 28)
  buf.writeUInt16LE(4, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(n * 4, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, mix[i]))
    const s = Math.round(v * 32767)
    buf.writeInt16LE(s, 44 + i * 4)
    buf.writeInt16LE(s, 46 + i * 4)
  }
  return buf
}

export function bedPath(root: string, music: StoryMusic | undefined): string | null {
  if (!music || music === 'none') return null
  return path.join(root, 'src/lib/reels/assets/audio/broadcast', `bed-${music}.m4a`)
}

/**
 * Narration + effects + ducked music bed → one WAV. `bedOffset`: where this part starts in
 * the whole video, so the music continues across the parts of a long video.
 */
export function extrasMixArgs(a: { narration: string; fx: string | null; bed: string | null; bedOffset: number; total: number; output: string }): string[] {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', a.narration]
  let idx = 1
  const fxIn = a.fx ? idx++ : -1
  if (a.fx) args.push('-i', a.fx)
  const bedIn = a.bed ? idx++ : -1
  if (a.bed) args.push('-stream_loop', '-1', '-ss', a.bedOffset.toFixed(3), '-i', a.bed)
  const t = a.total.toFixed(3)
  const parts: string[] = ['[0:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[nar][key]']
  const mixIn = ['[nar]']
  if (fxIn > 0) {
    parts.push(`[${fxIn}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.55[fx]`)
    mixIn.push('[fx]')
  }
  if (bedIn > 0) {
    // the bed sits low and dips further while the narrator speaks
    parts.push(`[${bedIn}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${t},volume=0.2,afade=t=out:st=${Math.max(0, a.total - 1.2).toFixed(3)}:d=1.2[bed0]`)
    parts.push('[bed0][key]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=450[bed]')
    mixIn.push('[bed]')
  } else {
    parts.push('[key]anullsink')
  }
  parts.push(`${mixIn.join('')}amix=inputs=${mixIn.length}:duration=first:normalize=0,alimiter=limit=0.95,apad,atrim=duration=${t}[out]`)
  args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', a.output)
  return args
}
