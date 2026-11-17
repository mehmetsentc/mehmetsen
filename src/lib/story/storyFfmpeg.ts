/**
 * STORY-1 — ffmpeg argv for «Konu → Video» (pure; the renderer spawns without a shell).
 *
 * 1. One segment per scene, all with identical stream parameters
 *    (1080×1920, 30 fps, yuv420p, H.264 / AAC 48 kHz stereo) so they can be
 *    cross-faded:
 *      still  — a pre-composed 1188×2112 JPEG drifting slowly across the frame
 *      video  — the editor's clip from `offset`, fitted over a blurred copy of
 *               itself, frozen on its last frame when shorter than the scene
 * 2. Final pass: xfade chain + caption overlay (PNG sequence with alpha via the
 *    concat demuxer) + narration mixed over the (ducked) original sound.
 */
import { FPS, OUT_H, OUT_W, XF } from './storyProject'

/** Stills are composed 10 % larger than the frame and drift across it (cheap crop, no per-frame scaling). */
export const STILL_W = 1188
export const STILL_H = 2112

/** Segments are intermediates: fastest preset at high quality; the final pass sets the delivery encode. */
const segEnc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', '60']
const aenc = ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2']
const f3 = (n: number) => n.toFixed(3)

/**
 * Slow drift across the 10 %-larger still (direction alternates per scene). A
 * per-frame crop is ~3× cheaper than zoompan, which matters on serverless CPUs.
 */
export function stillSegmentArgs(a: { image: string; output: string; seconds: number; index: number }): string[] {
  const d = Math.max(0.1, a.seconds)
  const dx = STILL_W - OUT_W
  const dy = STILL_H - OUT_H
  const pattern = a.index % 4
  const x = pattern === 0 ? `${dx}*t/${d.toFixed(3)}` : pattern === 1 ? `${dx}*(1-t/${d.toFixed(3)})` : pattern === 2 ? `${dx / 2}` : `${dx}*t/${d.toFixed(3)}`
  const y = pattern === 2 ? `${dy}*t/${d.toFixed(3)}` : pattern === 3 ? `${dy}*(1-t/${d.toFixed(3)})` : `${dy / 2}`
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-framerate', String(FPS), '-t', f3(a.seconds), '-i', a.image,
    '-f', 'lavfi', '-t', f3(a.seconds), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-filter_complex', `[0:v]scale=${STILL_W}:${STILL_H},setsar=1,crop=${OUT_W}:${OUT_H}:x='${x}':y='${y}',format=yuv420p[v]`,
    '-map', '[v]', '-map', '1:a',
    ...segEnc, ...aenc, '-t', f3(a.seconds), '-movflags', '+faststart', a.output,
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
  args.push(...segEnc, ...aenc, '-t', t, '-movflags', '+faststart', a.output)
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
 * The cross-fade is baked into each segment's head: «joined» segment i takes the last
 * XF seconds of raw segment i−1 and fades into raw segment i; its own last XF seconds
 * are left for the next join. The final pass then reads the joined segments one after
 * another (concat demuxer) — a single multi-input xfade graph decodes every input at
 * once and queued whole segments in memory (out-of-memory on a 2 GB function).
 */
export function joinArgs(a: { prev: string | null; prevLen: number; cur: string; curLen: number; last: boolean; output: string }): string[] {
  const keep = a.last ? a.curLen : a.curLen - XF
  const args = ['-hide_banner', '-loglevel', 'error', '-y']
  if (!a.prev) {
    args.push('-i', a.cur, '-t', f3(keep), '-c', 'copy', '-movflags', '+faststart', a.output)
    return args
  }
  args.push('-ss', f3(Math.max(0, a.prevLen - XF)), '-t', f3(XF), '-i', a.prev, '-i', a.cur)
  const fc =
    `[0:v]setpts=PTS-STARTPTS[pv];[1:v]setpts=PTS-STARTPTS[cv];[pv][cv]xfade=transition=fade:duration=${XF}:offset=0,trim=duration=${f3(keep)},setpts=PTS-STARTPTS,format=yuv420p[v];` +
    `[0:a]asetpts=PTS-STARTPTS[pa];[1:a]asetpts=PTS-STARTPTS[ca];[pa][ca]acrossfade=d=${XF}:c1=tri:c2=tri,atrim=duration=${f3(keep)},asetpts=PTS-STARTPTS[a]`
  args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]', ...segEnc, ...aenc, '-movflags', '+faststart', a.output)
  return args
}

/** ffconcat of the joined segments (read sequentially by the final pass). */
export function segmentConcat(files: string[]): string {
  return ['ffconcat version 1.0', ...files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`)].join('\n') + '\n'
}

/**
 * Final assembly. Inputs: joined segments (concat list), narration WAV, overlay concat list.
 * Output: H.264 High / AAC, moov first.
 */
export function finalArgs(a: { segmentList: string; narration: string; overlayList: string; output: string; total: number }): string[] {
  const args = ['-hide_banner', '-loglevel', 'error', '-y']
  args.push('-f', 'concat', '-safe', '0', '-i', a.segmentList)
  args.push('-i', a.narration)
  args.push('-f', 'concat', '-safe', '0', '-i', a.overlayList)
  const parts = [
    '[2:v]format=rgba,setpts=PTS-STARTPTS[ovl]',
    '[0:v]setpts=PTS-STARTPTS[base]',
    '[base][ovl]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v]',
    '[1:a]aresample=48000,aformat=channel_layouts=stereo[nar]',
    '[0:a]aresample=48000,aformat=channel_layouts=stereo[bg]',
    // loudnorm here held ~1 GB of video frames while its audio look-ahead filled; the narration is
    // normalized in its own audio-only pass, so the mix only needs a limiter.
    '[bg][nar]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]',
  ]
  args.push('-filter_complex', parts.join(';'), '-map', '[v]', '-map', '[a]')
  args.push('-c:v', 'libx264', '-preset', 'superfast', '-crf', '21', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', '60', '-keyint_min', '60', '-sc_threshold', '0')
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
