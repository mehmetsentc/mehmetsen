/** STORY-2 — yatay video, metin kartı ve parça parça üretim + kopyalayarak birleştirme (gerçek ffmpeg). */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { composeStory, runFfmpeg, type ComposeScene } from './storyCompose'
import { joinPartsArgs } from './storyFfmpeg'
import { composeCardStill, composeStill } from './storyOverlay'
import { FRAMES } from './storyProject'

const FF = process.env.FFMPEG_PATH || 'ffmpeg'
const E2E = process.env.STORY_E2E_DIR
const has = (() => { try { execFileSync(FF, ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()
const dur = (f: string) => {
  let err = ''
  try { execFileSync(FF, ['-hide_banner', '-i', f], { stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { err = String((e as { stderr?: Buffer }).stderr ?? '') }
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err)!
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

describe.skipIf(!has || !E2E)('long horizontal story in parts (ffmpeg)', () => {
  it('renders 3 parts and joins them seamlessly', async () => {
    const frame = FRAMES.horizontal
    const dir = mkdtempSync(path.join(os.tmpdir(), 'story-h-'))
    const S = JSON.parse(readFileSync(path.join(E2E!, 'script.json'), 'utf8')) as Array<{ cap: string; hl: string[]; dur: number }>
    const scenes: ComposeScene[] = []
    for (let i = 0; i < S.length; i++) {
      let visual: ComposeScene['visual']
      const f = path.join(dir, `still${i}.jpg`)
      if (i === 4) visual = { kind: 'video', file: path.join(E2E!, 'landscape.mp4'), offsetSec: 1.5, keepAudio: true }
      else if (i === 6) visual = { kind: 'video', file: path.join(E2E!, 'short_vertical_noaudio.mp4'), offsetSec: 0, keepAudio: false }
      else if (i === 2 || i === 7) {
        await composeCardStill({ word: S[i].hl[0] ?? 'Truva', title: 'Truva Atı gerçek miydi?', style: 'paper', index: i, outFile: f, frame, root: process.cwd() })
        visual = { kind: 'still', file: f }
      } else {
        await composeStill(readFileSync(path.join(E2E!, i === 3 ? 'wide_photo.jpg' : `scene${i}.png`)), f, frame)
        visual = { kind: 'still', file: f }
      }
      scenes.push({ text: S[i].cap, highlights: S[i].hl, meta: { label: i === 0 ? 'Truva Atı' : null, aiNote: false, source: null }, voiceWav: path.join(E2E!, `v${i}.wav`), voiceSec: S[i].dur, visual })
    }
    const ranges: Array<[number, number]> = [[0, 3], [3, 6], [6, S.length]]
    const parts: string[] = []
    let sum = 0
    for (const [from, to] of ranges) {
      const pdir = mkdtempSync(path.join(dir, 'p'))
      // only the part's scenes (and the one before) have files, as in production
      const sc = scenes.map((s, i) => (i >= from && i < to ? s : i === from - 1 ? { ...s, voiceWav: null } : { ...s, voiceWav: null, visual: null }))
      const r = await composeStory({ ffmpeg: FF, dir: pdir, scenes: sc, style: 'paper', seriesLabel: 'NaHaber · Tarih', root: process.cwd(), frame, range: { from, to } })
      expect(existsSync(r.file)).toBe(true)
      sum += r.seconds
      parts.push(r.file)
    }
    const list = path.join(dir, 'parts.ffconcat')
    writeFileSync(list, ['ffconcat version 1.0', ...parts.map((p) => `file '${p}'`)].join('\n') + '\n')
    const out = path.join(dir, 'joined.mp4')
    await runFfmpeg(FF, joinPartsArgs({ list, output: out }), 300_000)
    expect(Math.abs(dur(out) - sum)).toBeLessThan(0.3)
    const info = (() => { try { execFileSync(FF, ['-hide_banner', '-i', out], { stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? '') } return '' })()
    expect(info).toMatch(/1920x1080/)
    execFileSync('cp', [out, path.join(E2E!, 'out_horizontal_parts.mp4')])
  }, 900_000)
})
