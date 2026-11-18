import 'server-only'

/**
 * STORY-1 — local composition: stills / clips + narration WAVs → one MP4.
 * Pure file work (no network, no storage): storyRender downloads and uploads.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { buildTimeline, FRAMES, segmentLengths, type Frame, type StoryStyle, type StoryTimeline } from './storyProject'
import { finalArgs, joinArgs, overlayConcat, segmentConcat, stillSegmentArgs, videoSegmentArgs } from './storyFfmpeg'
import { renderOverlayStates } from './storyOverlay'
import type { SceneMeta } from './storyStates'

export type ComposeScene = {
  text: string
  highlights: string[]
  meta: SceneMeta
  /** null: scene outside the part being rendered (only its length matters) */
  voiceWav: string | null
  voiceSec: number
  visual: { kind: 'still'; file: string } | { kind: 'video'; file: string; offsetSec: number; keepAudio: boolean } | null
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
export function narrationArgs(wavs: string[], startsSec: number[], total: number, output: string, normalize = true): string[] {
  const args = ['-hide_banner', '-loglevel', 'error', '-y']
  for (const w of wavs) args.push('-i', w)
  const parts = wavs.map((_, i) => {
    const ms = Math.max(0, Math.round(startsSec[i] * 1000))
    return `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[n${i}]`
  })
  // parts of a long video are normalised together when they are joined
  const ln = normalize ? 'loudnorm=I=-16:TP=-1.5:LRA=11,' : ''
  const mix = wavs.length === 1 ? `[n0]${ln}aresample=48000,apad,atrim=duration=${total.toFixed(3)}[out]` : `${wavs.map((_, i) => `[n${i}]`).join('')}amix=inputs=${wavs.length}:duration=longest:normalize=0,${ln}aresample=48000,apad,atrim=duration=${total.toFixed(3)}[out]`
  args.push('-filter_complex', [...parts, mix].join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', output)
  return args
}

export type ComposeResult = { file: string; cover: string | null; seconds: number; timeline: StoryTimeline; offset: number }

/** The part [from, to) of the timeline, shifted to start at 0 (caption overlay of one part). */
export function sliceTimeline(tl: StoryTimeline, from: number, to: number): { timeline: StoryTimeline; t0: number; t1: number } {
  const t0 = from === 0 ? 0 : tl.scenes[from].start
  const t1 = to >= tl.scenes.length ? tl.total : tl.scenes[to].start
  const sh = (x: number) => x - t0
  const scenes = tl.scenes.slice(from, to).map((s, k) => ({
    ...s,
    index: k,
    start: sh(s.start),
    voiceStart: sh(s.voiceStart),
    labelAt: sh(s.labelAt),
    chunks: s.chunks.map((c) => ({ start: sh(c.start), end: Math.min(t1 - t0, sh(c.end)), words: c.words.map((w) => ({ ...w, start: sh(w.start) })) })),
  }))
  return { timeline: { scenes, total: t1 - t0 }, t0, t1 }
}

export async function composeStory(o: {
  ffmpeg: string
  dir: string
  scenes: ComposeScene[]
  style: StoryStyle
  seriesLabel: string
  root?: string
  frame?: Frame
  /** render only scenes [from, to) as one part of a long video (joined later without re-encoding) */
  range?: { from: number; to: number }
  /** NaHaber watermark drifting around the centre (default on) */
  watermark?: boolean
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
  const F = o.frame ?? FRAMES.vertical
  const voice = o.scenes.map((s) => s.voiceSec)
  const fullTl = buildTimeline(o.scenes, voice, F.capChars)
  const lens = segmentLengths(voice)
  const n = o.scenes.length
  const from = o.range?.from ?? 0
  const to = Math.min(n, o.range?.to ?? n)
  const part = !!o.range && !(from === 0 && to === n)
  const { timeline: tl, t0: T0 } = sliceTimeline(fullTl, from, to)

  const rawSeg = async (i: number): Promise<string> => {
    const s = o.scenes[i]
    if (!s.visual) throw new Error(`Sahne ${i + 1} görüntüsü hazır değil`)
    const out = path.join(o.dir, `seg${i}.mp4`)
    if (s.visual.kind === 'still') {
      await runFfmpeg(o.ffmpeg, stillSegmentArgs({ image: s.visual.file, output: out, seconds: lens[i], index: i, frame: F }), left())
    } else {
      const hasAudio = s.visual.keepAudio ? await hasAudioStream(o.ffmpeg, s.visual.file) : false
      await runFfmpeg(o.ffmpeg, videoSegmentArgs({ input: s.visual.file, output: out, seconds: lens[i], offsetSec: s.visual.offsetSec, keepAudio: s.visual.keepAudio, hasAudio, frame: F }), left())
    }
    return out
  }
  const segs: string[] = []
  // the part's first scene fades in from the previous scene's tail: render that one too
  if (from > 0) await rawSeg(from - 1)
  for (let i = from; i < to; i++) {
    const out = await rawSeg(i)
    // bake the cross-fade from the previous scene into this one's head (memory-safe final pass)
    const joined = path.join(o.dir, `join${i}.mp4`)
    await runFfmpeg(o.ffmpeg, joinArgs({ prev: i ? path.join(o.dir, `seg${i - 1}.mp4`) : null, prevLen: i ? lens[i - 1] : 0, cur: out, curLen: lens[i], last: i === n - 1, output: joined }), left())
    if (i > 0) await fs.rm(path.join(o.dir, `seg${i - 1}.mp4`), { force: true }).catch(() => undefined)
    segs.push(joined)
    step(`sahne ${i + 1}/${n}`)
  }
  await fs.rm(path.join(o.dir, `seg${to - 1}.mp4`), { force: true }).catch(() => undefined)
  const segList = path.join(o.dir, 'segments.ffconcat')
  await fs.writeFile(segList, segmentConcat(segs))
  const narration = path.join(o.dir, 'narration.wav')
  const wavs = o.scenes.slice(from, to).map((s, k) => {
    if (!s.voiceWav) throw new Error(`Sahne ${from + k + 1} seslendirmesi hazır değil`)
    return s.voiceWav
  })
  await runFfmpeg(o.ffmpeg, narrationArgs(wavs, tl.scenes.map((s) => s.voiceStart), tl.total, narration, !part), left())
  step('seslendirme')
  const ovDir = path.join(o.dir, 'ov')
  await fs.mkdir(ovDir, { recursive: true })
  const states = await renderOverlayStates(ovDir, { timeline: tl, meta: o.scenes.slice(from, to).map((s) => s.meta), style: o.style, seriesLabel: o.seriesLabel, frame: F }, o.root)
  const list = path.join(o.dir, 'overlay.ffconcat')
  await fs.writeFile(list, overlayConcat(states))
  step(`altyazı (${states.length} kare)`)
  const wmPath = path.join(o.root ?? process.cwd(), 'src/lib/story/watermark.png')
  const watermark = o.watermark === false ? null : await fs.access(wmPath).then(() => wmPath, () => null)
  if (o.watermark !== false && !watermark) console.warn('[story] watermark.png bulunamadı; filigransız üretiliyor')
  const file = path.join(o.dir, part ? `part${from}.mp4` : 'story.mp4')
  await runFfmpeg(o.ffmpeg, finalArgs({ segmentList: segList, narration, overlayList: list, output: file, total: tl.total, watermark, timeOffset: T0, part: !!o.range }), left())
  step('birleştirme')
  for (const sgm of segs) await fs.rm(sgm, { force: true }).catch(() => undefined)
  await fs.rm(ovDir, { recursive: true, force: true }).catch(() => undefined)
  let cover: string | null = null
  if (from === 0) {
    cover = path.join(o.dir, 'cover.jpg')
    const coverAt = Math.min(tl.total - 0.1, (tl.scenes[0]?.voiceStart ?? 0) + 1.2)
    const ok = await runFfmpeg(o.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', coverAt.toFixed(2), '-i', file, '-frames:v', '1', '-q:v', '3', cover], 60_000).then(() => true, () => false)
    if (!ok) cover = null
  }
  return { file, cover, seconds: tl.total, timeline: fullTl, offset: T0 }
}
