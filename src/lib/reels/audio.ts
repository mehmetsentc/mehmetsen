/**
 * REELS-1 — brand audio helpers (pure PCM math, no I/O).
 * The NaHaber stings/bed/sfx are our own synthesized WAVs (src/lib/reels/assets/audio).
 */

export type Pcm = { sampleRate: number; data: Float32Array }

/** Minimal PCM16 WAV reader (mono or first channel of stereo). */
export function readWav(buf: Buffer): Pcm {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('reels: not a WAV file')
  }
  let off = 12
  let channels = 1
  let sampleRate = 44100
  let bits = 16
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    const body = off + 8
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2)
      sampleRate = buf.readUInt32LE(body + 4)
      bits = buf.readUInt16LE(body + 14)
    } else if (id === 'data') {
      if (bits !== 16) throw new Error(`reels: WAV must be PCM16 (got ${bits})`)
      const frames = Math.floor(Math.min(size, buf.length - body) / (2 * channels))
      const data = new Float32Array(frames)
      for (let i = 0; i < frames; i++) data[i] = buf.readInt16LE(body + i * 2 * channels) / 32768
      return { sampleRate, data }
    }
    off = body + size + (size % 2)
  }
  throw new Error('reels: WAV has no data chunk')
}

export function writeWav(pcm: Pcm): Buffer {
  const n = pcm.data.length
  const out = Buffer.alloc(44 + n * 2)
  out.write('RIFF', 0, 'ascii')
  out.writeUInt32LE(36 + n * 2, 4)
  out.write('WAVE', 8, 'ascii')
  out.write('fmt ', 12, 'ascii')
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(pcm.sampleRate, 24)
  out.writeUInt32LE(pcm.sampleRate * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36, 'ascii')
  out.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, pcm.data[i]!))
    out.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return out
}

export function wavSeconds(buf: Buffer): number {
  const p = readWav(buf)
  return p.data.length / p.sampleRate
}

export type FxAssets = {
  intro: Pcm
  outro: Pcm
  click: Pcm
  whooshUp: Pcm
  whooshDown: Pcm
}

function mixAt(dst: Float32Array, sr: number, clip: Pcm, atSec: number, gain: number): void {
  if (clip.sampleRate !== sr) throw new Error('reels: fx sample rates must match')
  const start = Math.round(atSec * sr)
  for (let i = 0; i < clip.data.length; i++) {
    const j = start + i
    if (j < 0) continue
    if (j >= dst.length) break
    dst[j]! += clip.data[i]! * gain
  }
}

/** Stings + typewriter clicks + whooshes on one track, peak-normalized to 0.9. */
export function buildFxTrack(
  assets: FxAssets,
  t: { total: number; summaryStart: number; endStart: number },
  clicks: number[],
  extra: Array<{ clip: keyof FxAssets; at: number; gain: number }> = [],
): Pcm {
  const sr = assets.intro.sampleRate
  const data = new Float32Array(Math.ceil(t.total * sr))
  mixAt(data, sr, assets.intro, 0, 0.9)
  let seed = 17
  for (const c of clicks) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    mixAt(data, sr, assets.click, c, 0.07 * (0.8 + 0.4 * (seed / 2147483648)))
  }
  mixAt(data, sr, assets.whooshUp, t.summaryStart - 0.1, 0.04)
  mixAt(data, sr, assets.whooshDown, t.endStart - 0.2, 0.05)
  mixAt(data, sr, assets.outro, t.endStart + 0.05, 0.85)
  for (const e of extra) mixAt(data, sr, assets[e.clip], e.at, e.gain)
  let peak = 0
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!))
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] = (data[i]! / peak) * 0.9
  return { sampleRate: sr, data }
}

/**
 * ffmpeg audio graph: [1]=voice [2]=bed (looped) [3]=fx.
 * Voice: highpass + EQ + compression, delayed to voiceStart; bed ducks under voice;
 * final loudness −15 LUFS (Instagram/TikTok level).
 */
export function audioFilterGraph(voiceStartSec: number, bedVolume = 0.9): string {
  const d = Math.round(voiceStartSec * 1000)
  return (
    `[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono,highpass=f=90,equalizer=f=250:t=q:w=1:g=-2,` +
    `equalizer=f=3200:t=q:w=1.2:g=3,acompressor=threshold=-22dB:ratio=3:attack=5:release=90:makeup=4,` +
    `adelay=${d}|${d},apad,asplit=2[v][vsc];` +
    `[2:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono,volume=${bedVolume}[b];[b][vsc]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=250[bd];` +
    `[3:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[fx];[v][bd][fx]amix=inputs=3:normalize=0:weights=1 0.6 0.75,loudnorm=I=-15:TP=-1.5:LRA=8[a]`
  )
}
