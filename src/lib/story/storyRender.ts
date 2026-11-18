import 'server-only'

/**
 * STORY-1 — background work of «Konu → Video» (runs inside reel jobs, maxDuration 800):
 *   describeAsset   — what an upload shows (vision), stored on the asset
 *   generateImages  — missing AI illustrations, one by one, budget-capped
 *   renderStory     — narration (Google TTS, existing quota guard) + composition
 *                     → story/{id}/{renderKey}.mp4 (+ .jpg); an unchanged project is
 *                     never rendered twice
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getAdminStorage } from '@/lib/firebase/admin'
import { libraryVideoForReel } from '@/lib/reels/libraryVideo'
import { MAX_SOURCE_BYTES } from '@/lib/reels/sourceVideo'
import { resolveFfmpegPath } from '@/lib/reels/reelTheme'
import { synthesizeReelVoiceEx } from '@/lib/reels/voice'
import { getReelVoiceSettings } from '@/lib/reels/voiceSettings'
import { wavSeconds } from '@/lib/reels/audio'
import { describeImage, describeVideo, generateIllustration, StoryBudgetError } from './storyAi'
import { composeStory, runFfmpeg, type ComposeScene } from './storyCompose'
import { joinPartsArgs } from './storyFfmpeg'
import { composeCardStill, composeStill } from './storyOverlay'
import { chunkRanges, frameOf, imageKeyFor, missingImages, renderKeyFor, renderProblem, type StoryAsset, type StoryProject, type StoryScene } from './storyProject'
import { getStory, setAssetDescription, setRender, setSceneImage, storyBucket, uploadBucket } from './storyStore'

const publicUrl = (name: string) => `https://storage.googleapis.com/${storyBucket()}/${name}`

async function downloadUrl(url: string, out: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok || !res.body) throw new Error(`Video indirilemedi (HTTP ${res.status})`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_SOURCE_BYTES) throw new Error('Video 200 MB sınırını aşıyor')
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.byteLength || buf.byteLength > MAX_SOURCE_BYTES) throw new Error('Video boş veya 200 MB sınırını aşıyor')
  await fs.writeFile(out, buf)
}

async function uploadBytes(p: string): Promise<Buffer> {
  const [buf] = await getAdminStorage().bucket(uploadBucket()).file(p).download()
  return buf
}

function frameAt(ffmpeg: string, input: string, sec: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', sec.toFixed(2), '-i', input, '-frames:v', '1', '-vf', 'scale=640:-2', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], { shell: false, stdio: ['ignore', 'pipe', 'ignore'] })
    const chunks: Buffer[] = []
    const timer = setTimeout(() => child.kill('SIGKILL'), 45_000)
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.on('close', () => {
      clearTimeout(timer)
      const b = Buffer.concat(chunks)
      resolve(b.byteLength ? b : null)
    })
    child.on('error', () => resolve(null))
  })
}

export async function describeAsset(projectId: string, asset: StoryAsset): Promise<string> {
  try {
    let text: string
    if (asset.kind === 'image') {
      text = await describeImage(await uploadBytes(asset.ref))
    } else {
      const src = await libraryVideoForReel(asset.ref)
      if ('error' in src) throw new Error(src.error)
      const ffmpeg = await resolveFfmpegPath()
      const d = asset.durationMs ? asset.durationMs / 1000 : 8
      const frames = (await Promise.all([0.1, 0.35, 0.6, 0.85].map((f) => frameAt(ffmpeg, src.url, Math.max(0, d * f))))).filter((b): b is Buffer => !!b)
      if (!frames.length) throw new Error('Videodan kare alınamadı')
      text = await describeVideo(frames)
    }
    await setAssetDescription(projectId, asset.id, { description: text })
    return text
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Görüntü okunamadı'
    await setAssetDescription(projectId, asset.id, { error: message }).catch(() => undefined)
    throw err
  }
}

export async function generateImages(projectId: string, onlySceneId?: string): Promise<{ made: number; failed: number; budgetStop: boolean; errors: string[] }> {
  const p = await getStory(projectId)
  if (!p) throw new Error('Proje bulunamadı')
  const todo = missingImages(p).filter((s) => !onlySceneId || s.id === onlySceneId)
  const out = { made: 0, failed: 0, budgetStop: false, errors: [] as string[] }
  const bucket = getAdminStorage().bucket(storyBucket())
  for (const s of todo) {
    if (s.visual.kind !== 'ai') continue
    const key = imageKeyFor(s.visual.prompt, p.style, p.format)
    try {
      const img = await generateIllustration(s.visual.prompt, p.style, p.format)
      const ext = img.mime.includes('jpeg') || img.mime.includes('jpg') ? 'jpg' : img.mime.includes('webp') ? 'webp' : 'png'
      const name = `story/${projectId}/ai/${s.id}-${key}.${ext}`
      await bucket.file(name).save(img.bytes, { resumable: false, metadata: { contentType: img.mime, cacheControl: 'public, max-age=31536000' } })
      await bucket.file(name).makePublic()
      await setSceneImage(projectId, s.id, key, { imagePath: name, imageUrl: publicUrl(name) })
      out.made++
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Çizim üretilemedi'
      out.failed++
      out.errors.push(message)
      await setSceneImage(projectId, s.id, key, { error: message }).catch(() => undefined)
      if (err instanceof StoryBudgetError) {
        out.budgetStop = true
        break
      }
    }
  }
  return out
}

export type StoryRenderOutput = { outputUrl: string; coverUrl: string | null; seconds: number; reused: boolean; voiceEngine: string }

/** Long videos (and anything over ~100 s) are rendered in parallel parts. */
export const usesParts = (p: Pick<StoryProject, 'targetMin'>) => (p.targetMin ?? 1) > 1

async function voiceChoice() {
  // the studio's default voice and speed (Reels → Sesler)
  const vs = await getReelVoiceSettings().catch(() => null)
  return { voice: vs?.defaultVoice ?? null, rate: vs?.rate ?? null }
}

/** One scene's picture as a local still / video file (downloads cached per job in `videos`). */
async function sceneVisual(p: StoryProject, s: StoryScene, i: number, dir: string, videos: Map<string, string>, onStep?: (s: string) => void): Promise<{ visual: NonNullable<ComposeScene['visual']>; aiNote: boolean; source: string | null }> {
  const frame = frameOf(p)
  const bucket = getAdminStorage().bucket(storyBucket())
  if (s.visual.kind === 'asset') {
    const assetId = s.visual.assetId
    const asset = p.assets.find((a) => a.id === assetId)!
    const source = p.rights.kind !== 'owned' ? p.rights.sourceName : null
    if (asset.kind === 'image') {
      const f = path.join(dir, `still${i}.jpg`)
      await composeStill(await uploadBytes(asset.ref), f, frame)
      return { visual: { kind: 'still', file: f }, aiNote: false, source }
    }
    let f = videos.get(asset.ref)
    if (!f) {
      const src = await libraryVideoForReel(asset.ref)
      if ('error' in src) throw new Error(src.error)
      f = path.join(dir, `video_${asset.id}`)
      onStep?.(`video indiriliyor (${asset.name.slice(0, 30)})`)
      await downloadUrl(src.url, f)
      videos.set(asset.ref, f)
    }
    return { visual: { kind: 'video', file: f, offsetSec: s.visual.offsetMs / 1000, keepAudio: s.keepAudio }, aiNote: false, source }
  }
  const f = path.join(dir, `still${i}.jpg`)
  if (s.visual.kind === 'card') {
    const word = s.label || s.highlights[0] || s.text.split(/\s+/).slice(0, 2).join(' ')
    await composeCardStill({ word, title: p.title, style: p.style, index: i, outFile: f, frame })
    return { visual: { kind: 'still', file: f }, aiNote: false, source: null }
  }
  const [buf] = await bucket.file(s.visual.imagePath!).download()
  await composeStill(buf, f, frame)
  return { visual: { kind: 'still', file: f }, aiNote: true, source: null }
}

async function uploadPublic(local: string, name: string, contentType: string): Promise<string> {
  const bucket = getAdminStorage().bucket(storyBucket())
  await bucket.upload(local, { destination: name, resumable: (await fs.stat(local)).size > 8 * 1024 * 1024, metadata: { contentType, cacheControl: 'public, max-age=86400' } })
  await bucket.file(name).makePublic()
  return publicUrl(name)
}

export async function renderStory(projectId: string, onStep?: (s: string) => void): Promise<StoryRenderOutput & { key: string }> {
  const p = await getStory(projectId)
  if (!p) throw new Error('Proje bulunamadı')
  const problem = renderProblem(p)
  if (problem) throw new Error(problem)
  const key = renderKeyFor(p)
  const bucket = getAdminStorage().bucket(storyBucket())
  const mp4 = `story/${p.id}/${key}.mp4`
  const jpg = `story/${p.id}/${key}.jpg`
  const [exists] = await bucket.file(mp4).exists().catch(() => [false] as [boolean])
  if (exists && p.render.key === key && p.render.seconds) {
    return { key, outputUrl: publicUrl(mp4), coverUrl: p.render.coverUrl, seconds: p.render.seconds, reused: true, voiceEngine: 'önceki' }
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'story-'))
  try {
    const ffmpeg = await resolveFfmpegPath()
    const scenes: ComposeScene[] = []
    const videoFiles = new Map<string, string>()
    const engines = new Set<string>()
    const vc = await voiceChoice()
    for (let i = 0; i < p.scenes.length; i++) {
      const s = p.scenes[i]
      onStep?.(`ses ${i + 1}/${p.scenes.length}`)
      const voice = await synthesizeReelVoiceEx(s.text, AbortSignal.timeout(60_000), vc)
      engines.add(voice.engine)
      const wav = path.join(dir, `voice${i}.wav`)
      await fs.writeFile(wav, voice.wav)
      const v = await sceneVisual(p, s, i, dir, videoFiles, onStep)
      scenes.push({ text: s.text, highlights: s.highlights, meta: { label: s.label, aiNote: v.aiNote, source: v.source }, voiceWav: wav, voiceSec: wavSeconds(voice.wav), visual: v.visual })
    }
    const r = await composeStory({ ffmpeg, dir, scenes, style: p.style, seriesLabel: p.seriesLabel, frame: frameOf(p), budgetMs: 600_000, onStep })
    onStep?.('yükleniyor')
    const outputUrl = await uploadPublic(r.file, mp4, 'video/mp4')
    const coverUrl = r.cover ? await uploadPublic(r.cover, jpg, 'image/jpeg').catch(() => null) : null
    return { key, outputUrl, coverUrl, seconds: Math.round(r.seconds * 10) / 10, reused: false, voiceEngine: [...engines].join('+') }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ── long videos: prepare → parts (parallel jobs) → finish ─────────────────────

type WorkPlan = { key: string; voiceSec: number[]; ranges: Array<[number, number]>; engines: string }
const workDir = (id: string, key: string) => `story/${id}/work/${key}`
const partName = (id: string, key: string, k: number) => `${workDir(id, key)}/part${k}.mp4`

async function readPlan(id: string, key: string): Promise<WorkPlan | null> {
  const f = getAdminStorage().bucket(storyBucket()).file(`${workDir(id, key)}/plan.json`)
  const [ok] = await f.exists().catch(() => [false] as [boolean])
  if (!ok) return null
  const [buf] = await f.download()
  const plan = JSON.parse(buf.toString('utf8')) as WorkPlan
  return plan.key === key ? plan : null
}

export type LongRenderState =
  | { phase: 'ready' }
  | { phase: 'prepare' }
  | { phase: 'parts'; missing: number[]; total: number }
  | { phase: 'finish'; total: number }

/** Where a long render stands (Storage is the truth: plan.json and the part files). */
export async function longRenderState(p: StoryProject): Promise<LongRenderState> {
  const key = renderKeyFor(p)
  if (p.render.status === 'ready' && p.render.key === key && p.render.outputUrl) return { phase: 'ready' }
  const plan = await readPlan(p.id, key)
  if (!plan) return { phase: 'prepare' }
  const bucket = getAdminStorage().bucket(storyBucket())
  const [files] = await bucket.getFiles({ prefix: `${workDir(p.id, key)}/part` })
  const have = new Set(files.map((f) => f.name))
  const missing = plan.ranges.map((_, k) => k).filter((k) => !have.has(partName(p.id, key, k)))
  return missing.length ? { phase: 'parts', missing, total: plan.ranges.length } : { phase: 'finish', total: plan.ranges.length }
}

/** Narration for every scene (cached in Storage) and the part plan. */
export async function prepareLongRender(projectId: string): Promise<WorkPlan> {
  const p = await getStory(projectId)
  if (!p) throw new Error('Proje bulunamadı')
  const problem = renderProblem(p)
  if (problem) throw new Error(problem)
  const key = renderKeyFor(p)
  const existing = await readPlan(p.id, key)
  if (existing) return existing
  const bucket = getAdminStorage().bucket(storyBucket())
  const vc = await voiceChoice()
  const voiceSec: number[] = new Array(p.scenes.length).fill(0)
  const engines = new Set<string>()
  let next = 0
  const worker = async () => {
    while (next < p.scenes.length) {
      const i = next++
      const voice = await synthesizeReelVoiceEx(p.scenes[i].text, AbortSignal.timeout(60_000), vc)
      engines.add(voice.engine)
      voiceSec[i] = wavSeconds(voice.wav)
      await bucket.file(`${workDir(p.id, key)}/voice${i}.wav`).save(voice.wav, { resumable: false, metadata: { contentType: 'audio/wav' } })
    }
  }
  // a few at a time: fast, but well inside the TTS quota guard
  await Promise.all([worker(), worker(), worker()])
  const plan: WorkPlan = { key, voiceSec, ranges: chunkRanges(p.scenes, 45), engines: [...engines].join('+') }
  await bucket.file(`${workDir(p.id, key)}/plan.json`).save(JSON.stringify(plan), { resumable: false, metadata: { contentType: 'application/json' } })
  console.info(`[story] plan ${p.id} ${p.scenes.length} sahne → ${plan.ranges.length} parça`)
  return plan
}

/** One part (whole scenes, ≈ 45 s) of a long video. */
export async function renderLongPart(projectId: string, k: number, onStep?: (s: string) => void): Promise<{ part: number; seconds: number }> {
  const p = await getStory(projectId)
  if (!p) throw new Error('Proje bulunamadı')
  const key = renderKeyFor(p)
  const plan = await readPlan(p.id, key)
  if (!plan) throw new Error('Önce hazırlık adımı çalışmalı')
  const range = plan.ranges[k]
  if (!range) throw new Error('Parça bulunamadı')
  const [from, to] = range
  const bucket = getAdminStorage().bucket(storyBucket())
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `story-part${k}-`))
  try {
    const ffmpeg = await resolveFfmpegPath()
    const videos = new Map<string, string>()
    const scenes: ComposeScene[] = []
    for (let i = 0; i < p.scenes.length; i++) {
      const s = p.scenes[i]
      const inPart = i >= from && i < to
      const needed = inPart || i === from - 1
      let voiceWav: string | null = null
      if (inPart) {
        voiceWav = path.join(dir, `voice${i}.wav`)
        await bucket.file(`${workDir(p.id, key)}/voice${i}.wav`).download({ destination: voiceWav })
      }
      const v = needed ? await sceneVisual(p, s, i, dir, videos, onStep) : null
      scenes.push({ text: s.text, highlights: s.highlights, meta: { label: s.label, aiNote: v?.aiNote ?? false, source: v?.source ?? null }, voiceWav, voiceSec: plan.voiceSec[i], visual: v?.visual ?? null })
    }
    const r = await composeStory({ ffmpeg, dir, scenes, style: p.style, seriesLabel: p.seriesLabel, frame: frameOf(p), range: { from, to }, budgetMs: 700_000, onStep })
    for (const f of videos.values()) await fs.rm(f, { force: true }).catch(() => undefined)
    if (r.cover) await uploadPublic(r.cover, `${workDir(p.id, key)}/cover.jpg`, 'image/jpeg').catch(() => undefined)
    // the part goes up last: its presence marks it done
    await uploadPublic(r.file, partName(p.id, key, k), 'video/mp4')
    return { part: k, seconds: r.seconds }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Joins the parts (picture copied, sound encoded once) → the final MP4; removes the work files. */
export async function finishLongRender(projectId: string, onStep?: (s: string) => void): Promise<StoryRenderOutput & { key: string; stored: boolean }> {
  const p = await getStory(projectId)
  if (!p) throw new Error('Proje bulunamadı')
  const key = renderKeyFor(p)
  const plan = await readPlan(p.id, key)
  if (!plan) throw new Error('Önce hazırlık adımı çalışmalı')
  const bucket = getAdminStorage().bucket(storyBucket())
  const mp4 = `story/${p.id}/${key}.mp4`
  const jpg = `story/${p.id}/${key}.jpg`
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'story-join-'))
  try {
    const ffmpeg = await resolveFfmpegPath()
    const urls = plan.ranges.map((_, k) => publicUrl(partName(p.id, key, k)))
    const list = path.join(dir, 'parts.ffconcat')
    const out = path.join(dir, 'story.mp4')
    await fs.writeFile(list, ['ffconcat version 1.0', ...urls.map((u) => `file '${u}'`)].join('\n') + '\n')
    onStep?.('parçalar birleştiriliyor')
    try {
      await runFfmpeg(ffmpeg, joinPartsArgs({ list, output: out }), 600_000)
    } catch (err) {
      // no https in this ffmpeg build: join local copies instead
      console.warn('[story] https birleştirme olmadı, yerel kopyalarla deneniyor', err instanceof Error ? err.message : err)
      const local = await Promise.all(plan.ranges.map(async (_, k) => {
        const f = path.join(dir, `part${k}.mp4`)
        await bucket.file(partName(p.id, key, k)).download({ destination: f })
        return f
      }))
      await fs.writeFile(list, ['ffconcat version 1.0', ...local.map((f) => `file '${f}'`)].join('\n') + '\n')
      await runFfmpeg(ffmpeg, joinPartsArgs({ list, output: out }), 600_000)
      for (const f of local) await fs.rm(f, { force: true }).catch(() => undefined)
    }
    onStep?.('yükleniyor')
    const outputUrl = await uploadPublic(out, mp4, 'video/mp4')
    let coverUrl: string | null = null
    const coverFile = bucket.file(`${workDir(p.id, key)}/cover.jpg`)
    if ((await coverFile.exists().catch(() => [false] as [boolean]))[0]) {
      await coverFile.copy(bucket.file(jpg)).catch(() => undefined)
      await bucket.file(jpg).makePublic().then(() => (coverUrl = publicUrl(jpg)), () => undefined)
    }
    const total = await probeSeconds(ffmpeg, out).catch(() => 0)
    const stored = await setRender(p.id, key, { status: 'ready', outputUrl, coverUrl, seconds: Math.round(total * 10) / 10, error: null, renderedAt: Date.now() })
    await bucket.deleteFiles({ prefix: `${workDir(p.id, key)}/` }).catch(() => undefined)
    return { key, outputUrl, coverUrl, seconds: Math.round(total * 10) / 10, reused: false, voiceEngine: plan.engines, stored }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Duration from ffmpeg's «Duration: hh:mm:ss.xx» line. */
function probeSeconds(ffmpeg: string, file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-i', file], { shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d: Buffer) => {
      if (err.length < 20000) err += d.toString()
    })
    child.on('close', () => {
      const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err)
      if (m) resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]))
      else reject(new Error('süre okunamadı'))
    })
    child.on('error', reject)
  })
}

export async function failRender(projectId: string, err: unknown): Promise<void> {
  const p = await getStory(projectId).catch(() => null)
  if (p) await setRender(projectId, renderKeyFor(p), { status: 'failed', outputUrl: null, coverUrl: null, seconds: null, error: (err instanceof Error ? err.message : 'Video üretilemedi').slice(0, 300), renderedAt: Date.now() }).catch(() => undefined)
}

export async function renderAndStore(projectId: string, onStep?: (s: string) => void): Promise<StoryRenderOutput & { stored: boolean }> {
  try {
    const r = await renderStory(projectId, onStep)
    const stored = await setRender(projectId, r.key, { status: 'ready', outputUrl: r.outputUrl, coverUrl: r.coverUrl, seconds: r.seconds, error: null, renderedAt: Date.now() })
    return { ...r, stored }
  } catch (err) {
    await failRender(projectId, err)
    throw err
  }
}

export type { StoryProject }
