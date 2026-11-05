/**
 * MEDIA-1 — real ffmpeg (ffmpeg-static) on synthetic sources: both frames,
 * with / without an audio track, overlay PNG, mute. Checks the output is a
 * platform-safe MP4 of the requested length.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/admin', () => ({ getAdminStorage: () => null }))
vi.mock('@/lib/reels/libraryVideo', () => ({ libraryVideoForReel: async () => ({ error: 'n/a' }) }))

import ffmpegPath from 'ffmpeg-static'
import { clipFfmpegArgs, DEFAULT_CLIP_OPTIONS, parseClipOptions } from './mediaProject'
import { renderOverlayPng } from './mediaRender'

const ff = ffmpegPath as unknown as string
let dir = ''
const has = !!ff && existsSync(ff)

function probe(file: string): { w: number; h: number; dur: number; audio: boolean; fps: string; codec: string } {
  // ffmpeg -i prints stream info to stderr and exits 1 (no output) — read it from the error.
  let out = ''
  try {
    execFileSync(ff, ['-hide_banner', '-i', file], { stdio: 'pipe' })
  } catch (e) {
    out = String((e as { stderr?: Buffer }).stderr ?? '')
  }
  const v = out.match(/Video: (\w+).*?, (\d{2,5})x(\d{2,5})/)
  const d = out.match(/Duration: (\d+):(\d+):([\d.]+)/)
  const fps = out.match(/(\d+(?:\.\d+)?) fps/)
  return {
    codec: v?.[1] ?? '',
    w: Number(v?.[2] ?? 0),
    h: Number(v?.[3] ?? 0),
    dur: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
    audio: /Audio: aac/.test(out),
    fps: fps?.[1] ?? '',
  }
}

beforeAll(() => {
  if (!has) return
  dir = mkdtempSync(path.join(os.tmpdir(), 'media-test-'))
  // 16:9, 25 fps, 12 s with a tone · and a 9:16 clip without audio
  execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=25:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', path.join(dir, 'wide.mp4')])
  execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30:duration=8', '-c:v', 'libx264', path.join(dir, 'tall-silent.mp4')])
}, 60_000)
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(!has)('clip ffmpeg (gerçek ffmpeg)', () => {
  it('dikey + yazı/logo/kaynak katmanı: 1080×1920, 30 fps, istenen süre, AAC', async () => {
    const options = { ...DEFAULT_CLIP_OPTIONS }
    const png = await renderOverlayPng({ title: 'Antalya’da sağanak: cadde göle döndü, araçlar yolda kaldı', sourceLabel: 'Ahmet Yılmaz', options })
    expect(png).not.toBeNull()
    const pngPath = path.join(dir, 'ov.png')
    writeFileSync(pngPath, png!)
    const out = path.join(dir, 'v1.mp4')
    execFileSync(ff, clipFfmpegArgs({ input: path.join(dir, 'wide.mp4'), overlay: pngPath, output: out, startMs: 2000, endMs: 7500, options }))
    const p = probe(out)
    expect(p).toMatchObject({ codec: 'h264', w: 1080, h: 1920, audio: true, fps: '30' })
    expect(Math.abs(p.dur - 5.5)).toBeLessThan(0.2)
  }, 60_000)

  it('orijinal haliyle: kırpma ve yazı yok, oran korunur; sessiz kaynak hata vermez', () => {
    const options = parseClipOptions({ frame: 'original', showTitle: true, showLogo: true })
    expect(options).toMatchObject({ showTitle: false, showLogo: false, showSource: false })
    const out = path.join(dir, 'o1.mp4')
    execFileSync(ff, clipFfmpegArgs({ input: path.join(dir, 'wide.mp4'), overlay: null, output: out, startMs: 0, endMs: 4000, options }))
    expect(probe(out)).toMatchObject({ w: 1280, h: 720, audio: true, fps: '30' })
    const out2 = path.join(dir, 'o2.mp4')
    execFileSync(ff, clipFfmpegArgs({ input: path.join(dir, 'tall-silent.mp4'), overlay: null, output: out2, startMs: 1000, endMs: 5000, options }))
    const p2 = probe(out2)
    expect(p2).toMatchObject({ w: 720, h: 1280, audio: false })
    expect(Math.abs(p2.dur - 4)).toBeLessThan(0.2)
  }, 60_000)

  it('yazısız dikey + sessize alma: katman dosyası olmadan çalışır', () => {
    const options = { ...DEFAULT_CLIP_OPTIONS, showTitle: false, showLogo: false, showSource: false, mute: true }
    const out = path.join(dir, 'm1.mp4')
    execFileSync(ff, clipFfmpegArgs({ input: path.join(dir, 'wide.mp4'), overlay: null, output: out, startMs: 0, endMs: 3000, options }))
    expect(probe(out)).toMatchObject({ w: 1080, h: 1920, audio: true })
  }, 60_000)
})
