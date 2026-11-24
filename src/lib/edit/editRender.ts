import 'server-only'

/**
 * KURGU — renders an edit project to a public MP4 + cover JPEG.
 * Sources are downloaded once per render to /tmp (videos ≤ 200 MB, HLS converted),
 * text overlays are drawn as full-canvas PNGs, the closing card is drawn at the canvas
 * shape, ffmpeg runs without a shell with a hard time limit.
 * Output: edit/{projectId}/{renderKey}.mp4 (+ .jpg) — an unchanged project is never rendered twice.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { getAdminStorage } from '@/lib/firebase/admin'
import { FONT_MD, FONT_XB, bedPath, ensureFonts, resolveFfmpegPath, roundRectPath } from '@/lib/reels/reelTheme'
import { wrapLines } from '@/lib/reels/timeline'
import { composeOutroStill } from '@/lib/story/storyOverlay'
import { FRAMES } from '@/lib/story/storyProject'
import { canvasSize, timeline, type EditAsset, type EditProject, type TextItem } from './editProject'
import { editFfmpegArgs, type BuildClip } from './editFfmpeg'

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
const FFMPEG_TIMEOUT_MS = 600_000
const MAX_BYTES = 200 * 1024 * 1024
const publicUrl = (name: string) => `https://storage.googleapis.com/${BUCKET}/${name}`

export const editOutputPath = (id: string, key: string, ext: 'mp4' | 'jpg') => `edit/${id.replace(/[^A-Za-z0-9_-]/g, '_')}/${key}.${ext}`

function run(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d: Buffer) => {
      if (err.length < 20_000) err += d.toString()
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
        console.warn('[edit-render] ffmpeg failed', code, err.replace(/\/[^\s'"]+/g, '<path>').slice(-600))
        reject(new Error(`Video işlenemedi (ffmpeg ${code})`))
      }
    })
  })
}

/** Size + audio presence from the ffmpeg banner. */
async function probe(bin: string, file: string): Promise<{ w: number; h: number; hasAudio: boolean }> {
  const err = await new Promise<string>((resolve) => {
    const p = spawn(bin, ['-hide_banner', '-i', file], { shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
    let e = ''
    p.stderr.on('data', (d: Buffer) => {
      if (e.length < 20_000) e += d.toString()
    })
    const t = setTimeout(() => p.kill('SIGKILL'), 20_000)
    p.on('close', () => (clearTimeout(t), resolve(e)))
    p.on('error', () => (clearTimeout(t), resolve('')))
  })
  const m = err.match(/Video:.*?(\d{2,5})x(\d{2,5})/)
  const rot = /rotate\s*:\s*-?(90|270)|rotation of -?(90|270)/.test(err)
  const w = m ? Number(m[1]) : 0
  const h = m ? Number(m[2]) : 0
  return { w: rot ? h : w, h: rot ? w : h, hasAudio: /Stream #\d+:\d+.*Audio:/.test(err) }
}

async function fetchTo(url: string, out: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`Medya indirilemedi (HTTP ${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.byteLength || buf.byteLength > MAX_BYTES) throw new Error('Medya dosyası boş ya da 200 MB sınırını aşıyor')
  await fs.writeFile(out, buf)
}

async function fetchAsset(a: EditAsset, dir: string): Promise<string> {
  const out = path.join(dir, `asset_${a.id}`)
  if (a.kind === 'video') {
    const { prepareSourceVideo } = await import('@/lib/reels/sourceVideo')
    const v = await prepareSourceVideo({
      url: a.url,
      origin: /firebasestorage|storage\.googleapis\.com|nahaber\.com|r2\.dev|r2\.cloudflarestorage/i.test(a.url) ? 'nahaber' : 'external',
      hls: /\.m3u8(\?|$)/i.test(a.url),
      tag: `edit_${a.id}`,
    })
    if (!v.ok) throw new Error(`«${a.name}» indirilemedi`)
    await fs.copyFile(v.path, out)
    await fs.rm(v.path, { force: true }).catch(() => undefined)
    return out
  }
  await fetchTo(a.url, out)
  return out
}

/** One text overlay as a transparent full-canvas PNG. */
export async function drawTextPng(t: TextItem, W: number, H: number, file: string, root = process.cwd()): Promise<void> {
  ensureFonts(root)
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  const k = Math.min(W, H) / 1080
  const size = Math.round(t.size * k)
  const bold = t.style !== 'altyazi' && t.style !== 'sade'
  ctx.font = `${size}px ${bold ? FONT_XB : FONT_MD}`
  const maxW = W * (t.style === 'altbant' ? 0.86 : 0.84)
  const lines = wrapLines((x) => ctx.measureText(x).width, t.text, maxW, 6)
  const lh = Math.round(size * 1.2)
  const blockH = lines.length * lh
  const widths = lines.map((l) => ctx.measureText(l).width)
  const bw = Math.max(...widths)
  const cx = t.x * W
  const cy = t.y * H
  const top = cy - blockH / 2
  const pad = Math.round(size * 0.35)
  ctx.textBaseline = 'top'
  if (t.style === 'altbant') {
    const x0 = Math.max(0, cx - bw / 2 - pad)
    ctx.fillStyle = 'rgba(227,27,35,0.95)'
    ctx.fillRect(x0, top - pad, bw + pad * 2, blockH + pad * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(x0, top + blockH + pad, bw + pad * 2, Math.max(3, Math.round(6 * k)))
    ctx.fillStyle = t.color
    lines.forEach((l, i) => ctx.fillText(l, x0 + pad, top + i * lh))
  } else if (t.style === 'etiket') {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((-3 * Math.PI) / 180)
    ctx.fillStyle = '#FACC15'
    roundRectPath(ctx, -bw / 2 - pad, -blockH / 2 - pad * 0.6, bw + pad * 2, blockH + pad * 1.2, Math.round(10 * k))
    ctx.fill()
    ctx.fillStyle = '#111111'
    lines.forEach((l, i) => ctx.fillText(l, -widths[i]! / 2, -blockH / 2 + i * lh))
    ctx.restore()
  } else if (t.style === 'altyazi') {
    lines.forEach((l, i) => {
      const w = widths[i]!
      ctx.fillStyle = 'rgba(0,0,0,0.62)'
      roundRectPath(ctx, cx - w / 2 - pad, top + i * lh - pad * 0.35, w + pad * 2, lh + pad * 0.5, Math.round(10 * k))
      ctx.fill()
      ctx.fillStyle = t.color
      ctx.fillText(l, cx - w / 2, top + i * lh)
    })
  } else {
    // baslik / sade: text with a soft shadow
    ctx.shadowColor = 'rgba(0,0,0,0.75)'
    ctx.shadowBlur = Math.round(14 * k)
    ctx.shadowOffsetY = Math.round(3 * k)
    ctx.fillStyle = t.color
    lines.forEach((l, i) => ctx.fillText(l, cx - widths[i]! / 2, top + i * lh))
  }
  await fs.writeFile(file, await canvas.encode('png'))
}

export interface EditRenderOutput {
  outputUrl: string
  coverUrl: string | null
  seconds: number
  reused: boolean
}

export async function renderEditProject(p: EditProject, key: string, onStep?: (s: string) => void): Promise<EditRenderOutput> {
  const bucket = getAdminStorage().bucket(BUCKET)
  const mp4Name = editOutputPath(p.id, key, 'mp4')
  const jpgName = editOutputPath(p.id, key, 'jpg')
  const tl = timeline(p.clips)
  const seconds = tl.total / 1000 + (p.closing ? 2.6 : 0)
  const [exists] = await bucket.file(mp4Name).exists().catch(() => [false] as [boolean])
  if (exists) {
    const [jpg] = await bucket.file(jpgName).exists().catch(() => [false] as [boolean])
    return { outputUrl: publicUrl(mp4Name), coverUrl: jpg ? publicUrl(jpgName) : null, seconds, reused: true }
  }
  const root = process.cwd()
  const ffmpeg = await resolveFfmpegPath()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edit-'))
  try {
    // 1. media (each asset once)
    const files = new Map<string, string>()
    const info = new Map<string, { w: number; h: number; hasAudio: boolean }>()
    const used = new Set([...p.clips.map((c) => c.assetId), ...p.audio.map((a) => a.assetId).filter((x): x is string => !!x)])
    let i = 0
    for (const a of p.assets) {
      if (!used.has(a.id)) continue
      onStep?.(`medya indiriliyor ${++i}/${used.size}`)
      const f = await fetchAsset(a, dir)
      files.set(a.id, f)
      if (a.kind !== 'audio') info.set(a.id, await probe(ffmpeg, f))
    }
    const firstVideo = p.clips.map((c) => info.get(c.assetId)).find((x) => x && x.w && x.h) ?? null
    const [W, H] = canvasSize(p.aspect, firstVideo)

    // 2. text overlays
    const texts: Array<{ item: TextItem; png: string }> = []
    for (const t of p.texts) {
      if (t.startMs >= tl.total) continue
      const png = path.join(dir, `text_${t.id}.png`)
      await drawTextPng(t, W, H, png, root)
      texts.push({ item: t, png })
    }

    // 3. audio items
    const audio: Array<{ item: (typeof p.audio)[number]; path: string; loop: boolean }> = []
    for (const x of p.audio) {
      if (x.startMs >= tl.total) continue
      if (x.assetId) {
        const f = files.get(x.assetId)
        if (f) audio.push({ item: x, path: f, loop: false })
        continue
      }
      const bed = bedPath(root, x.music)
      if (bed && (await fs.stat(bed).then(() => true).catch(() => false))) audio.push({ item: x, path: bed, loop: true })
      else console.warn('[edit-render] müzik dosyası yok', x.music)
    }

    // 4. closing card at the canvas shape
    let outro: { image: string; sting: string | null } | null = null
    if (p.closing) {
      try {
        const base = H > W ? FRAMES.vertical : FRAMES.horizontal
        const img = path.join(dir, 'outro.jpg')
        await composeOutroStill({ style: 'haber', outFile: img, frame: { ...base, w: W, h: H, stillW: W, stillH: H } })
        const sting = path.join(root, 'src/lib/reels/assets/audio/broadcast/outro-soft.wav')
        outro = { image: img, sting: (await fs.stat(sting).then(() => true).catch(() => false)) ? sting : null }
      } catch (err) {
        console.warn('[edit-render] kapanış kartı hazırlanamadı', err instanceof Error ? err.message : err)
      }
    }

    // 5. render
    const clips: BuildClip[] = p.clips.map((c) => {
      const a = p.assets.find((x) => x.id === c.assetId)!
      return { clip: c, kind: a.kind === 'image' ? 'image' : 'video', path: files.get(a.id)!, hasAudio: !!info.get(a.id)?.hasAudio }
    })
    const out = path.join(dir, 'out.mp4')
    const jpg = path.join(dir, 'cover.jpg')
    onStep?.('video birleştiriliyor')
    await run(ffmpeg, editFfmpegArgs({ W, H, clips, texts, audio, outro, output: out }), FFMPEG_TIMEOUT_MS)
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', Math.min(1, tl.total / 2000).toFixed(2), '-i', out, '-frames:v', '1', '-q:v', '3', jpg], 60_000).catch(() => '')

    onStep?.('yükleniyor')
    await bucket.upload(out, { destination: mp4Name, resumable: (await fs.stat(out)).size > 8 * 1024 * 1024, metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=86400' } })
    await bucket.file(mp4Name).makePublic()
    let coverUrl: string | null = null
    try {
      await bucket.upload(jpg, { destination: jpgName, metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400' } })
      await bucket.file(jpgName).makePublic()
      coverUrl = publicUrl(jpgName)
    } catch {
      coverUrl = null
    }
    return { outputUrl: publicUrl(mp4Name), coverUrl, seconds, reused: false }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
