/**
 * REELS-T2 — «Temiz» şablonlar: ekranda yazı yok, yalnız NaHaber filigranı; bitiş kartı yok.
 * Seslendirmeli (voice_then_video) ve orijinal sesli (video_only). Gerçek ffmpeg ile render.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fallbackTemplate, reelTemplate, templateHasVoice } from './reelTemplates'
import { renderDynamic, watermarkPos } from './renderDynamic'
import { writeWav } from './audio'
import { REEL_H, REEL_W } from './timeline'

const FF = '/usr/bin/ffmpeg'
const hasFfmpeg = existsSync(FF)

/** Whole frame (scaled to 108×192) as RGB at time t. */
function frame(file: string, t: number): Buffer {
  const r = spawnSync(FF, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=108:192', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 })
  return r.stdout as Buffer
}
/** Share of pixels that are far from the grey source (text, bands, fades would raise it). */
function offGrey(b: Buffer): number {
  let n = 0
  for (let i = 0; i < b.length; i += 3) {
    if (Math.abs(b[i]! - 128) + Math.abs(b[i + 1]! - 128) + Math.abs(b[i + 2]! - 128) > 24) n++
  }
  return n / (b.length / 3)
}
function seconds(file: string): number {
  const r = spawnSync(FF, ['-i', file], { encoding: 'utf8' })
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0
}
function hasAudioStream(file: string): boolean {
  return /Audio:/.test(spawnSync(FF, ['-i', file], { encoding: 'utf8' }).stderr)
}

describe('REELS-T2 templates', () => {
  it('temiz şablonlar yazısız; biri seslendirmeli, biri seslendirmesiz', () => {
    expect(reelTemplate('temiz').textStyle).toBe('clean')
    expect(reelTemplate('temiz_orijinal').textStyle).toBe('clean')
    expect(templateHasVoice(reelTemplate('temiz'))).toBe(true)
    expect(templateHasVoice(reelTemplate('temiz_orijinal'))).toBe(false)
    // videosuz haberde de temiz ve seslendirmesiz kalır
    expect(fallbackTemplate('temiz_orijinal')).toBe('temiz_orijinal')
  })
  it('filigran kadrajın içinde dolaşır ve yerinde durmaz', () => {
    const seen = new Set<string>()
    for (let t = 0; t < 60; t += 0.5) {
      const p = watermarkPos(t, 150, 156)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x + 150).toBeLessThanOrEqual(REEL_W)
      expect(p.y + 156).toBeLessThanOrEqual(REEL_H)
      seen.add(`${Math.round(p.x / 100)}:${Math.round(p.y / 100)}`)
    }
    expect(seen.size).toBeGreaterThan(10)
  })
})

describe.skipIf(!hasFfmpeg)('REELS-T2 render (gerçek ffmpeg)', () => {
  const base = {
    headline: 'Antalya’da sağanak: cadde göle döndü, araçlar yolda kaldı',
    summary: 'Kentte etkili olan sağanak nedeniyle bazı caddeler suyla doldu.',
    category: 'Gündem',
    layout: 'dinamik',
    textStyle: 'clean',
  }
  async function greyVideo(dir: string, d: number): Promise<string> {
    const src = path.join(dir, 'grey.mp4')
    spawnSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x808080:s=540x960:d=${d}:r=30`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${d}:sample_rate=48000`, '-shortest', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', src])
    return src
  }

  it('orijinal ses: videonun tamamı, yazı/bant/bitiş kartı yok, yalnız filigran', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rt2-'))
    const src = await greyVideo(dir, 10)
    const out = await renderDynamic({ ...base, media: { kind: 'video', path: src }, audioMode: 'video_only' } as never)
    const file = path.join(dir, 'out.mp4')
    await fs.writeFile(file, out.mp4)
    // video kadar sürer; bitiş kartı eklenmez
    expect(out.seconds).toBeGreaterThan(9.5)
    expect(out.seconds).toBeLessThan(10.1)
    expect(seconds(file)).toBeLessThan(10.3)
    expect(hasAudioStream(file)).toBe(true)
    for (const t of [0.3, 1.5, 5, 9.5]) {
      const f = frame(file, t)
      const off = offGrey(f)
      // yalnız küçük filigran griden ayrılır (yazı / karartma yok)
      expect(off).toBeGreaterThan(0)
      expect(off).toBeLessThan(0.03)
    }
    await fs.rm(dir, { recursive: true, force: true })
  }, 180_000)

  it('seslendirmeli: spiker video üzerinde, ekranda yazı yok, ardından videonun kalanı', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rt2v-'))
    const src = await greyVideo(dir, 14)
    const sr = 24000
    const voice = new Float32Array(sr * 4)
    for (let i = 0; i < voice.length; i++) voice[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / sr)
    const out = await renderDynamic({ ...base, media: { kind: 'video', path: src }, audioMode: 'voice_then_video', voiceWav: writeWav({ sampleRate: sr, data: voice }), captions: 'Kentte sağanak etkili oldu. Ekipler çalışıyor.' } as never)
    const file = path.join(dir, 'out.mp4')
    await fs.writeFile(file, out.mp4)
    // 0.45 + 4 s ses + videonun kalan ~9 s'si; bitiş kartı yok
    expect(out.seconds).toBeGreaterThan(12.5)
    expect(out.seconds).toBeLessThanOrEqual(14)
    for (const t of [1, 3, 8, 12]) {
      const off = offGrey(frame(file, t))
      expect(off).toBeGreaterThan(0)
      expect(off).toBeLessThan(0.03)
    }
    await fs.rm(dir, { recursive: true, force: true })
  }, 180_000)
})
