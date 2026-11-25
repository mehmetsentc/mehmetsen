import 'server-only'

/** ffmpeg atempo + duraklama uzatma → videoya uydurulmuş WAV */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readWav, writeWav } from '@/lib/reels/audio'
import { resolveFfmpegPath } from '@/lib/reels/reelTheme'
import { planTempo, stretchPauses } from './adFit'

async function applyTempo(wav: Buffer, tempo: number): Promise<Buffer> {
  if (Math.abs(tempo - 1) < 0.005) return wav
  const ffmpeg = await resolveFfmpegPath()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adfit-'))
  try {
    const inp = path.join(dir, 'in.wav')
    const out = path.join(dir, 'out.wav')
    await fs.writeFile(inp, wav)
    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', inp, '-af', `atempo=${tempo.toFixed(4)}`, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', out], { stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      p.stderr!.on('data', (d) => (err += String(d)))
      const timer = setTimeout(() => p.kill('SIGKILL'), 60_000)
      p.on('close', (code) => (clearTimeout(timer), code === 0 ? resolve() : reject(new Error(`atempo: ${err.slice(0, 160)}`))))
      p.on('error', (e) => (clearTimeout(timer), reject(e)))
    })
    return await fs.readFile(out)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function fitVoiceToVideo(raw: Buffer, targetMs: number): Promise<{ wav: Buffer; tempo: number; addedPauseMs: number; durationMs: number }> {
  const pcm0 = readWav(raw)
  const durationMs = (pcm0.data.length / pcm0.sampleRate) * 1000
  const tempo = planTempo(durationMs, targetMs)
  const tempoed = readWav(await applyTempo(raw, tempo))
  const st = stretchPauses(tempoed.data, tempoed.sampleRate, targetMs)
  const wav = writeWav({ sampleRate: tempoed.sampleRate, data: st.data })
  return { wav, tempo, addedPauseMs: st.addedMs, durationMs: Math.round((st.data.length / tempoed.sampleRate) * 1000) }
}
