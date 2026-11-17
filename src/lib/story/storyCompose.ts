import 'server-only'

/**
 * STORY-1 — local composition: stills / clips + narration WAVs → one MP4.
 * Pure file work (no network, no storage): storyRender downloads and uploads.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { buildTimeline, segmentLengths, type StoryStyle, type StoryTimeline } from './storyProject'
import { finalArgs, joinArgs, overlayConcat, segmentConcat, stillSegmentArgs, videoSegmentArgs } from './storyFfmpeg'
import { renderOverlayStates } from './storyOverlay'
import type { SceneMeta } from './storyStates'

export type ComposeScene = {
  text: string
  highlights: string[]
  meta: SceneMeta
  voiceWav: string
  voiceSec: number
  visual: { kind: 'still'; file: string } | { kind: 'video'; file: string; offsetSec: number; keepAudio: boolean }
}

export function runFfmpeg(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d: Buffer) => {
      if (err.length < 8000) err += d.toString()
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Video işleme zaman aşımına uğradı'))
    }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(err)
      else {
        console.warn('[story] ffmpeg failed', code, err.replace(/\/[^\s'"]+/g, '<path>').slice(0, 400))
        reject(new Error(`Video işlenemedi (ffmpeg ${code})`))
      }
    })
  })
}

/** Whether a media file has an audio stream (ffmpeg -i prints the stream list on stderr). */
export async function hasAudioStream(bin: string, file: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, ['-hide_banner', '-i', file], { shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d: Buffer) => {
      if (err.length < 20000) err += d.toString()
    })
    child.on('close', () => resolve(/Stream #\d+:\d+.*Audio:/.test(err)))
    child.on('error', () => resolve(false))
  })
}

/** Narration track: every scene's WAV at its own start time. */
export function narrationArgs(wavs: string[], startsSec: number[], total: number, output: string): string[] {
  const args = ['-hide_banner', '-loglevel', 'error', '-y']
  for (const w of wavs) args.push('-i', w)
  const parts = wavs.map((_, i) => {
    const ms = Math.max(0, Math.round(startsSec[i] * 1000))
    return `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[n${i}]`
  })
  const mix = wavs.length === 1 ? `[n0]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad,atrim=duration=${total.toFixed(3)}[out]` : `${wavs.map((_, i) => `[n${i}]`).join('')}amix=inputs=${wavs.length}:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad,atrim=duration=${total.toFixed(3)}[out]`
  args.push('-filter_complex', [...parts, mix].join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', output)
  return args
}

export type ComposeResult = { file: string; cover: string | null; seconds: number; timeline: StoryTimeline }

export async function composeStory(o: {
  ffmpeg: string
  dir: string
  scenes: ComposeScene[]
  style: StoryStyle
  seriesLabel: string
  root?: string
  /** stop before the platform function limit (ms, whole composition) */
  budgetMs?: number
  onStep?: (step: string) => void
}): Promise<ComposeResult> {
  const t0 = Date.now()
  const budget = o.budgetMs ?? 600_000
  const left = () => Math.max(30_000, budget - (Date.now() - t0))
  let tStep = t0
  const step = (name: string) => {
    const now = Date.now()
    console.info(`[story] ${name} ${now - tStep} ms (toplam ${now - t0} ms)`)
    tStep = now
    o.onStep?.(name)
  }
  const voice = o.scenes.map((s) => s.voiceSec)
  const tl = buildTimeline(o.scenes, voice)
  const lens = segmentLengths(voice)
  const segs: string[] = []
  for (let i = 0; i < o.scenes.length; i++) {
    const s = o.scenes[i]
    const out = path.join(o.dir, `seg${i}.mp4`)
    if (s.visual.kind === 'still') {
      await runFfmpeg(o.ffmpeg, stillSegmentArgs({ image: s.visual.file, output: out, seconds: lens[i], index: i }), left())
    } else {
      const hasAudio = s.visual.keepAudio ? await hasAudioStream(o.ffmpeg, s.visual.file) : false
      await runFfmpeg(o.ffmpeg, videoSegmentArgs({ input: s.visual.file, output: out, seconds: lens[i], offsetSec: s.visual.offsetSec, keepAudio: s.visual.keepAudio, hasAudio }), left())
    }
    // bake the cross-fade from the previous scene into this one's head (memory-safe final pass)
    const joined = path.join(o.dir, `join${i}.mp4`)
    await runFfmpeg(o.ffmpeg, joinArgs({ prev: i ? path.join(o.dir, `seg${i - 1}.mp4`) : null, prevLen: i ? lens[i - 1] : 0, cur: out, curLen: lens[i], last: i === o.scenes.length - 1, output: joined }), left())
    if (i > 1) await fs.rm(path.join(o.dir, `seg${i - 2}.mp4`), { force: true }).catch(() => undefined)
    segs.push(joined)
    step(`sahne ${i + 1}/${o.scenes.length}`)
  }
  const segList = path.join(o.dir, 'segments.ffconcat')
  await fs.writeFile(segList, segmentConcat(segs))
  const narration = path.join(o.dir, 'narration.wav')
  await runFfmpeg(o.ffmpeg, narrationArgs(o.scenes.map((s) => s.voiceWav), tl.scenes.map((s) => s.voiceStart), tl.total, narration), left())
  step('seslendirme')
  const ovDir = path.join(o.dir, 'ov')
  await fs.mkdir(ovDir, { recursive: true })
  const states = await renderOverlayStates(ovDir, { timeline: tl, meta: o.scenes.map((s) => s.meta), style: o.style, seriesLabel: o.seriesLabel }, o.root)
  const list = path.join(o.dir, 'overlay.ffconcat')
  await fs.writeFile(list, overlayConcat(states))
  step(`altyazı (${states.length} kare)`)
  const file = path.join(o.dir, 'story.mp4')
  await runFfmpeg(o.ffmpeg, finalArgs({ segmentList: segList, narration, overlayList: list, output: file, total: tl.total }), left())
  step('birleştirme')
  const cover = path.join(o.dir, 'cover.jpg')
  const coverAt = Math.min(tl.total - 0.1, (tl.scenes[0]?.voiceStart ?? 0) + 1.2)
  const ok = await runFfmpeg(o.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', coverAt.toFixed(2), '-i', file, '-frames:v', '1', '-q:v', '3', cover], 60_000).then(() => true, () => false)
  return { file, cover: ok ? cover : null, seconds: tl.total, timeline: tl }
}
