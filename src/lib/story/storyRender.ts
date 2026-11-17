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
import { composeStory, type ComposeScene } from './storyCompose'
import { composeStill } from './storyOverlay'
import { imageKeyFor, missingImages, renderKeyFor, renderProblem, type StoryAsset, type StoryProject } from './storyProject'
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
    const key = imageKeyFor(s.visual.prompt, p.style)
    try {
      const img = await generateIllustration(s.visual.prompt, p.style)
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
    // the studio's default voice and speed (Reels → Sesler)
    const vs = await getReelVoiceSettings().catch(() => null)
    const voiceChoice = { voice: vs?.defaultVoice ?? null, rate: vs?.rate ?? null }
    for (let i = 0; i < p.scenes.length; i++) {
      const s = p.scenes[i]
      onStep?.(`ses ${i + 1}/${p.scenes.length}`)
      const voice = await synthesizeReelVoiceEx(s.text, AbortSignal.timeout(60_000), voiceChoice)
      engines.add(voice.engine)
      const wav = path.join(dir, `voice${i}.wav`)
      await fs.writeFile(wav, voice.wav)
      const voiceSec = wavSeconds(voice.wav)
      let visual: ComposeScene['visual']
      let aiNote = false
      let source: string | null = null
      if (s.visual.kind === 'asset') {
        const assetId = s.visual.assetId
        const asset = p.assets.find((a) => a.id === assetId)!
        source = p.rights.kind !== 'owned' ? p.rights.sourceName : null
        if (asset.kind === 'image') {
          const f = path.join(dir, `still${i}.jpg`)
          await composeStill(await uploadBytes(asset.ref), f)
          visual = { kind: 'still', file: f }
        } else {
          let f = videoFiles.get(asset.ref)
          if (!f) {
            const src = await libraryVideoForReel(asset.ref)
            if ('error' in src) throw new Error(src.error)
            f = path.join(dir, `video_${asset.id}`)
            onStep?.(`video indiriliyor (${asset.name.slice(0, 30)})`)
            await downloadUrl(src.url, f)
            videoFiles.set(asset.ref, f)
          }
          visual = { kind: 'video', file: f, offsetSec: s.visual.offsetMs / 1000, keepAudio: s.keepAudio }
        }
      } else {
        aiNote = true
        const [buf] = await bucket.file(s.visual.imagePath!).download()
        const f = path.join(dir, `still${i}.jpg`)
        await composeStill(buf, f)
        visual = { kind: 'still', file: f }
      }
      scenes.push({ text: s.text, highlights: s.highlights, meta: { label: s.label, aiNote, source }, voiceWav: wav, voiceSec, visual })
    }
    const r = await composeStory({ ffmpeg, dir, scenes, style: p.style, seriesLabel: p.seriesLabel, budgetMs: 600_000, onStep })
    onStep?.('yükleniyor')
    await bucket.file(mp4).save(await fs.readFile(r.file), { resumable: false, metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=86400' } })
    await bucket.file(mp4).makePublic()
    let coverUrl: string | null = null
    if (r.cover) {
      try {
        await bucket.file(jpg).save(await fs.readFile(r.cover), { resumable: false, metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400' } })
        await bucket.file(jpg).makePublic()
        coverUrl = publicUrl(jpg)
      } catch {
        coverUrl = null
      }
    }
    return { key, outputUrl: publicUrl(mp4), coverUrl, seconds: Math.round(r.seconds * 10) / 10, reused: false, voiceEngine: [...engines].join('+') }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function renderAndStore(projectId: string, onStep?: (s: string) => void): Promise<StoryRenderOutput & { stored: boolean }> {
  try {
    const r = await renderStory(projectId, onStep)
    const stored = await setRender(projectId, r.key, { status: 'ready', outputUrl: r.outputUrl, coverUrl: r.coverUrl, seconds: r.seconds, error: null, renderedAt: Date.now() })
    return { ...r, stored }
  } catch (err) {
    const p = await getStory(projectId).catch(() => null)
    if (p) await setRender(projectId, renderKeyFor(p), { status: 'failed', outputUrl: null, coverUrl: null, seconds: null, error: (err instanceof Error ? err.message : 'Video üretilemedi').slice(0, 300), renderedAt: Date.now() }).catch(() => undefined)
    throw err
  }
}

export type { StoryProject }
