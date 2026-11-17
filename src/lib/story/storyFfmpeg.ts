/**
 * STORY-1 — ffmpeg argv for «Konu → Video» (pure; the renderer spawns without a shell).
 *
 * 1. One segment per scene, all with identical stream parameters
 *    (1080×1920, 30 fps, yuv420p, H.264 / AAC 48 kHz stereo) so they can be
 *    cross-faded:
 *      still  — a pre-composed 1620×2880 JPEG with a slow zoom / drift (zoompan)
 *      video  — the editor's clip from `offset`, fitted over a blurred copy of
 *               itself, frozen on its last frame when shorter than the scene
 * 2. Final pass: xfade chain + caption overlay (PNG sequence with alpha via the
 *    concat demuxer) + narration mixed over the (ducked) original sound.
 */
import { FPS, OUT_H, OUT_W, XF } from './storyProject'

export const STILL_W = 1620
export const STILL_H = 2880

const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', '60']
const aenc = ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2']
const f3 = (n: number) => n.toFixed(3)

/** Zoom 1.00 → 1.08 with a small horizontal drift (direction alternates per scene). */
export function stillSegmentArgs(a: { image: string; output: string; seconds: number; index: number }): string[] {
  const frames = Math.max(1, Math.round(a.seconds * FPS))
  const dir = a.index % 2 === 0 ? 1 : -1
  const z = `1+0.08*on/${frames}`
  const x = `(iw-iw/zoom)/2+${dir}*(iw-iw/zoom)*0.35*(on/${frames}-0.5)`
  const y = `(ih-ih/zoom)/2-(ih-ih/zoom)*0.15*on/${frames}`
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-framerate', String(FPS), '-t', f3(a.seconds), '-i', a.image,
    '-f', 'lavfi', '-t', f3(a.seconds), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-filter_complex', `[0:v]scale=${STILL_W}:${STILL_H},setsar=1,zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${OUT_W}x${OUT_H}:fps=${FPS},format=yuv420p[v]`,
    '-map', '[v]', '-map', '1:a',
    ...enc, ...aenc, '-t', f3(a.seconds), '-movflags', '+faststart', a.output,
  ]
}

/** The editor's video from `offsetSec`, vertical with blurred fill; ducked sound or silence. */
export function videoSegmentArgs(a: { input: string; output: string; seconds: number; offsetSec: number; keepAudio: boolean; hasAudio: boolean }): string[] {
  const t = f3(a.seconds)
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', f3(a.offsetSec), '-i', a.input, '-f', 'lavfi', '-t', t, '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000']
  const v =
    `[0:v]fps=${FPS},split=2[a][b];` +
    `[a]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},boxblur=24:2,eq=brightness=-0.08[bg];` +
    `[b]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,tpad=stop_mode=clone:stop_duration=${t},trim=duration=${t},setpts=PTS-STARTPTS,format=yuv420p[v]`
  const au = a.keepAudio && a.hasAudio
    ? `;[0:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.18,apad,atrim=duration=${t},asetpts=PTS-STARTPTS[aout]`
    : ''
  args.push('-filter_complex', v + au, '-map', '[v]', '-map', au ? '[aout]' : '1:a')
  args.push(...enc, ...aenc, '-t', t, '-movflags', '+faststart', a.output)
  return args
}

/** xfade offsets: segment i (i ≥ 1) begins at Σ_{j<i}(len_j − XF). */
export function xfadeOffsets(lengths: number[]): number[] {
  const out: number[] = []
  let s = 0
  for (let i = 0; i < lengths.length; i++) {
    out.push(s)
    s += lengths[i] - XF
  }
  return out
}

/**
 * Final assembly. Inputs: segments…, narration WAV, overlay concat list.
 * Output: H.264 High / AAC, moov first.
 */
export function finalArgs(a: { segments: string[]; lengths: number[]; narration: string; overlayList: string; output: string; total: number }): string[] {
  const n = a.segments.length
  const args = ['-hide_banner', '-loglevel', 'error', '-y']
  for (const s of a.segments) args.push('-i', s)
  args.push('-i', a.narration)
  args.push('-f', 'concat', '-safe', '0', '-i', a.overlayList)
  const nar = n
  const ov = n + 1
  const offs = xfadeOffsets(a.lengths)
  const parts: string[] = []
  let vPrev = '[0:v]'
  let aPrev = '[0:a]'
  for (let i = 1; i < n; i++) {
    const vOut = i === n - 1 ? '[vx]' : `[v${i}]`
    const aOut = i === n - 1 ? '[ax]' : `[a${i}]`
    parts.push(`${vPrev}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${f3(offs[i])}${vOut}`)
    parts.push(`${aPrev}[${i}:a]acrossfade=d=${XF}:c1=tri:c2=tri${aOut}`)
    vPrev = vOut
    aPrev = aOut
  }
  if (n === 1) {
    parts.push('[0:v]null[vx]', '[0:a]anull[ax]')
  }
  parts.push(`[${ov}:v]format=rgba,setpts=PTS-STARTPTS[ovl]`)
  parts.push(`[vx][ovl]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v]`)
  parts.push(`[${nar}:a]aresample=48000,aformat=channel_layouts=stereo[nar]`)
  parts.push(`[ax][nar]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`)
  args.push('-filter_complex', parts.join(';'), '-map', '[v]', '-map', '[a]')
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', '60', '-keyint_min', '60', '-sc_threshold', '0')
  args.push(...aenc, '-t', f3(a.total), '-movflags', '+faststart', a.output)
  return args
}

/** ffconcat for the overlay PNG states: each state shown for its duration. */
export function overlayConcat(states: Array<{ file: string; duration: number }>): string {
  const lines = ['ffconcat version 1.0']
  for (const s of states) {
    lines.push(`file '${s.file.replace(/'/g, "'\\''")}'`)
    lines.push(`duration ${Math.max(1 / FPS, s.duration).toFixed(4)}`)
  }
  // the concat demuxer ignores the last duration unless the file is repeated
  if (states.length) lines.push(`file '${states[states.length - 1].file.replace(/'/g, "'\\''")}'`)
  return lines.join('\n') + '\n'
}
