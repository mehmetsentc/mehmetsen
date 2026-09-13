import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLAYBACK_MP4_BASE64, fixtureBytes } from './r2SelfTestFixtures'
import { findMp4BoxOffsets } from './r2SelfTest'

function ffprobeJson(path: string): Record<string, unknown> {
  const result = spawnSync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-count_frames', path],
    { encoding: 'utf8' },
  )
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout) as Record<string, unknown>
}

describe('V1C.1R6 playback fixture is browser-playable', () => {
  const bytes = fixtureBytes(PLAYBACK_MP4_BASE64)
  const dir = mkdtempSync(join(tmpdir(), 'nahaber-r2-fixture-'))
  const path = join(dir, 'playback-720p.mp4')
  writeFileSync(path, bytes)

  it('is a complete faststart MP4 with duration > 0', () => {
    expect(bytes.byteLength).toBeGreaterThan(1000)
    const boxes = findMp4BoxOffsets(bytes)
    expect(boxes.ftyp).toBe(0)
    expect(boxes.moov).not.toBeNull()
    expect(boxes.mdat).not.toBeNull()
    expect(boxes.moov!).toBeLessThan(boxes.mdat!)
  })

  it('ffprobe reports H.264 + AAC (or no audio) with duration > 0', () => {
    const probe = ffprobeJson(path)
    const format = probe.format as { duration?: string; format_name?: string }
    const streams = probe.streams as Array<{
      codec_type?: string
      codec_name?: string
      profile?: string
      width?: number
      height?: number
      duration?: string
      nb_read_frames?: string
    }>
    expect(format.format_name).toMatch(/mp4/)
    expect(Number(format.duration)).toBeGreaterThan(0)

    const video = streams.find((s) => s.codec_type === 'video')
    expect(video?.codec_name).toBe('h264')
    expect(video?.profile).toMatch(/Baseline|Constrained Baseline|Main/)
    expect(video?.width).toBeGreaterThan(0)
    expect(video?.height).toBeGreaterThan(0)
    expect(Number(video?.nb_read_frames)).toBeGreaterThan(0)

    const audio = streams.find((s) => s.codec_type === 'audio')
    if (audio) {
      expect(audio.codec_name).toBe('aac')
    }
  })
})
