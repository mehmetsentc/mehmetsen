import { ffprobeBin, runSpawn, SpawnFailedError, type SpawnRunOptions } from './spawn'
import { buildProbeArgs } from './encodeArgs'
import { formatAspectRatio } from './scale'

export type ProbedVideo = {
  width: number
  height: number
  durationSec: number
  durationMs: number
  aspectRatio: string
  videoCodec: string | null
  audioCodec: string | null
  fps: number | null
  hasAudio: boolean
}

type FfprobeStream = {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
}

type FfprobeJson = {
  format?: { duration?: string }
  streams?: FfprobeStream[]
}

function parseFps(raw: string | undefined): number | null {
  if (!raw || raw === '0/0') return null
  const [a, b] = raw.split('/').map(Number)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null
  const fps = a / b
  return Number.isFinite(fps) ? Math.round(fps * 1000) / 1000 : null
}

export function parseProbeJson(raw: string): ProbedVideo {
  let parsed: FfprobeJson
  try {
    parsed = JSON.parse(raw) as FfprobeJson
  } catch {
    throw new SpawnFailedError('FFPROBE_FAILED', raw.slice(-2000), 'ffprobe JSON parse failed')
  }
  const video = parsed.streams?.find((s) => s.codec_type === 'video')
  const audio = parsed.streams?.find((s) => s.codec_type === 'audio')
  const width = Number(video?.width ?? 0)
  const height = Number(video?.height ?? 0)
  if (!video || width < 2 || height < 2) {
    throw new SpawnFailedError('FFPROBE_FAILED', raw.slice(-2000), 'No video stream')
  }
  const durationSec = Number(parsed.format?.duration ?? 0)
  const durationMs = Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : 0
  return {
    width,
    height,
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    durationMs,
    aspectRatio: formatAspectRatio(width, height),
    videoCodec: video.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    fps: parseFps(video.avg_frame_rate) ?? parseFps(video.r_frame_rate),
    hasAudio: Boolean(audio),
  }
}

export async function probeVideoFile(
  inputPath: string,
  opts: SpawnRunOptions,
  probeBinary = ffprobeBin()
): Promise<ProbedVideo> {
  const args = buildProbeArgs(inputPath)
  const result = await runSpawn(probeBinary, args, opts)
  if (result.code !== 0) {
    throw new SpawnFailedError('FFPROBE_FAILED', result.stderr)
  }
  return parseProbeJson(result.stdout)
}
