/** STORY-1 — gerçek ffmpeg ile uçtan uca: fotoğraf, yatay video (sesli), kısa dikey video (sessiz), çizim. */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { composeStory, type ComposeScene } from './storyCompose'
import { composeStill } from './storyOverlay'

const FF = process.env.FFMPEG_PATH || 'ffmpeg'
const E2E = process.env.STORY_E2E_DIR
const has = (() => { try { execFileSync(FF, ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()

describe.skipIf(!has || !E2E)('composeStory (ffmpeg)', () => {
  it('renders a mixed story video with captions and narration', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'story-'))
    const S = JSON.parse(readFileSync(path.join(E2E!, 'script.json'), 'utf8')) as Array<{ cap: string; hl: string[]; dur: number }>
    const scenes: ComposeScene[] = []
    for (let i = 0; i < S.length; i++) {
      let visual: ComposeScene['visual']
      let meta = { label: null as string | null, aiNote: true, source: null as string | null }
      if (i === 3) {
        const f = path.join(dir, `still${i}.jpg`)
        await composeStill(readFileSync(path.join(E2E!, 'wide_photo.jpg')), f)
        visual = { kind: 'still', file: f }
        meta = { label: 'Hisarlık', aiNote: false, source: 'Okur fotoğrafı' }
      } else if (i === 4) {
        visual = { kind: 'video', file: path.join(E2E!, 'landscape.mp4'), offsetSec: 1.5, keepAudio: true }
        meta = { label: '1871', aiNote: false, source: 'DHA' }
      } else if (i === 6) {
        visual = { kind: 'video', file: path.join(E2E!, 'short_vertical_noaudio.mp4'), offsetSec: 0, keepAudio: true }
        meta = { label: null, aiNote: false, source: null }
      } else {
        const f = path.join(dir, `still${i}.jpg`)
        await composeStill(readFileSync(path.join(E2E!, `scene${i}.png`)), f)
        visual = { kind: 'still', file: f }
        meta.label = i === 0 ? 'Truva Atı' : i === 8 ? 'UNESCO 1998' : null
      }
      scenes.push({ text: S[i].cap, highlights: S[i].hl, meta, voiceWav: path.join(E2E!, `v${i}.wav`), voiceSec: S[i].dur, visual })
    }
    const steps: string[] = []
    const r = await composeStory({ ffmpeg: FF, dir, scenes, style: 'paper', seriesLabel: 'NaHaber · Tarih Defteri', root: process.cwd(), onStep: (s) => steps.push(s) })
    expect(existsSync(r.file)).toBe(true)
    expect(r.cover).not.toBeNull()
    const probe = execFileSync(FF, ['-hide_banner', '-i', r.file, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
    void probe
    expect(r.seconds).toBeGreaterThan(25)
    expect(steps).toContain('birleştirme')
    execFileSync('cp', [r.file, path.join(E2E!, 'out_story.mp4')])
  }, 600_000)
})
