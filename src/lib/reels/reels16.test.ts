/**
 * REELS-16 — «Orijinal Ses» (no voice-over): the headline is shown only for the
 * first 3 seconds, then the story's original video plays clean (no scrolling
 * band, no summary, no dark fade). Real ffmpeg render on a synthetic video.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { reelTemplate } from './reelTemplates'
import { INTRO_HEAD_S, renderDynamic } from './renderDynamic'

const FF = '/usr/bin/ffmpeg'
const hasFfmpeg = existsSync(FF)

/** Mean RGB of the lower text area (where headline / band / captions would be) at time t. */
function lowerAreaRgb(file: string, t: number): [number, number, number] {
  const r = spawnSync(FF, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'crop=900:520:90:1250,scale=90:52', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 })
  const b = r.stdout as Buffer
  let R = 0
  let G = 0
  let B = 0
  const n = b.length / 3
  for (let i = 0; i < b.length; i += 3) {
    R += b[i]!
    G += b[i + 1]!
    B += b[i + 2]!
  }
  return [R / n, G / n, B / n]
}

describe('REELS-16 template', () => {
  it('«Orijinal Ses» uses the 3-second headline style, no voice-over', () => {
    const t = reelTemplate('orijinal')
    expect(t.textStyle).toBe('intro')
    expect(t.audioMode).toBe('video_only')
    expect(INTRO_HEAD_S).toBe(3)
  })
})

describe.skipIf(!hasFfmpeg)('REELS-16 render (gerçek ffmpeg)', () => {
  it('ilk 3 sn manşet; sonra alt alan videonun kendisi (yazı / bant / karartma yok); süre = video', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'r16-'))
    const src = path.join(dir, 'blue.mp4')
    // solid mid-grey video with a loud tone (real sound → video_only stays)
    spawnSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x808080:s=540x960:d=8:r=30', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8:sample_rate=48000', '-shortest', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', src])
    const out = await renderDynamic({
      headline: 'Antalya’da sağanak: cadde göle döndü, araçlar yolda kaldı',
      summary: 'Kentte etkili olan sağanak nedeniyle bazı caddeler suyla doldu. Ekipler bölgede çalışma yapıyor.',
      category: 'Gündem',
      media: { kind: 'video', path: src },
      audioMode: 'video_only',
      textStyle: 'intro',
      layout: 'dinamik',
    } as never)
    const file = path.join(dir, 'out.mp4')
    await fs.writeFile(file, out.mp4)

    // the reel lasts as long as the story video (+ end card), not a reading time
    expect(out.timeline.endStart).toBeGreaterThan(7)
    expect(out.timeline.endStart).toBeLessThan(8.1)

    const during = lowerAreaRgb(file, 1.6)
    const after = lowerAreaRgb(file, 5.5)
    // after the headline: the lower area is the grey video itself (no dark fade, no white text)
    for (const c of after) {
      expect(c).toBeGreaterThan(110)
      expect(c).toBeLessThan(150)
    }
    // during the headline: darker fade + white text make the area clearly different
    const diff = Math.abs(during[0] - after[0]) + Math.abs(during[1] - after[1]) + Math.abs(during[2] - after[2])
    expect(diff).toBeGreaterThan(20)
    await fs.rm(dir, { recursive: true, force: true })
  }, 180_000)
})
