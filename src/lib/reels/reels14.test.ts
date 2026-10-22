import { describe, expect, it } from 'vitest'
import { existsSync, promises as fs } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { videoFrames } from './reelTheme'
import { projectRenderMs, renderDynamic } from './renderDynamic'

const FF = '/usr/bin/ffmpeg'
const hasFfmpeg = existsSync(FF)

describe.skipIf(!hasFfmpeg)('REELS-14 video kare okuma ve süre bütçesi', () => {
  it('kareler tam ve doğru; yarıda bırakılınca ffmpeg kapanır', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'r14-'))
    const src = path.join(dir, 'red.mp4')
    spawnSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=2:r=30', '-pix_fmt', 'yuv420p', src])
    let n = 0
    let px: number[] = []
    for await (const f of videoFrames(FF, src, 30, 64, 64)) {
      expect(f.length).toBe(64 * 64 * 4)
      if (n === 10) px = [f[0]!, f[1]!, f[2]!, f[3]!]
      n++
    }
    expect(n).toBe(30)
    expect(px[0]).toBeGreaterThan(200)
    expect(px[1]).toBeLessThan(60)
    expect(px[3]).toBe(255)
    // early stop: the generator's finally kills ffmpeg
    const g = videoFrames(FF, src, 1000, 64, 64)
    await g.next()
    await g.return(undefined)
    await fs.rm(dir, { recursive: true, force: true })
  }, 60_000)

  it('süre tahmini', () => {
    expect(projectRenderMs(9_000, 90, 1800)).toBe(180_000)
    expect(projectRenderMs(0, 0, 100)).toBe(0)
  })

  it('bütçeyi aşacak video render ilk karelerden sonra durur (RenderBudgetError)', async () => {
    process.env.FFMPEG_PATH = FF
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'r14b-'))
    const src = path.join(dir, 'v.mp4')
    const wav = path.join(dir, 'v.wav')
    spawnSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=10:r=30', '-pix_fmt', 'yuv420p', src])
    spawnSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anoisesrc=d=8:a=0.05', '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', wav])
    const t0 = Date.now()
    const err = await renderDynamic(
      { headline: 'Test', summary: 'Özet.', category: 'Gündem', media: { kind: 'video', path: src }, voiceWav: await fs.readFile(wav), layout: 'dinamik' } as never,
      { budgetMs: 1 },
    ).catch((e: Error) => e)
    expect((err as Error).name).toBe('RenderBudgetError')
    expect(Date.now() - t0).toBeLessThan(90_000)
    await fs.rm(dir, { recursive: true, force: true })
  }, 120_000)
})
