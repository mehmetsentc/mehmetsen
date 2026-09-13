import { selectPosterTimestampSec } from './posterFrame'
import type { PlaybackSize } from './scale'

export function buildPlaybackEncodeArgs(input: {
  inputPath: string
  outputPath: string
  size: PlaybackSize
  hasAudio: boolean
}): string[] {
  const args = [
    '-hide_banner',
    '-y',
    '-i',
    input.inputPath,
    '-map',
    '0:v:0',
    '-vf',
    `scale=${input.size.width}:${input.size.height}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'high',
    '-level',
    '4.0',
    '-g',
    '48',
    '-keyint_min',
    '48',
    '-sc_threshold',
    '0',
  ]
  if (input.hasAudio) {
    args.push(
      '-map',
      '0:a:0',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
      '-ar',
      '48000'
    )
  } else {
    args.push('-an')
  }
  args.push('-movflags', '+faststart', '-max_muxing_queue_size', '1024', input.outputPath)
  return args
}

export function buildPosterPngArgs(input: {
  inputPath: string
  outputPath: string
  durationSec: number
}): string[] {
  const ss = selectPosterTimestampSec(input.durationSec)
  return [
    '-hide_banner',
    '-y',
    '-ss',
    String(ss),
    '-i',
    input.inputPath,
    '-frames:v',
    '1',
    '-vf',
    'scale=min(iw\\,720):-2',
    input.outputPath,
  ]
}

export function buildCwebpArgs(input: { inputPath: string; outputPath: string }): string[] {
  return ['-quiet', '-q', '72', input.inputPath, '-o', input.outputPath]
}

export function buildProbeArgs(inputPath: string): string[] {
  return [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ]
}

export function assertArgsAreArgv(args: string[]): void {
  if (!Array.isArray(args)) throw new Error('INVALID_SPAWN_ARG')
  for (const arg of args) {
    if (typeof arg !== 'string') throw new Error('INVALID_SPAWN_ARG')
    if (arg.includes('\0')) throw new Error('INVALID_SPAWN_ARG')
  }
}
