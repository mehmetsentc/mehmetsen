/**
 * VIDEO-KES — ffmpeg argv for an edited clip (pure; the renderer spawns it without a shell).
 *
 *   • kept parts: one fast-seek input per part (`-ss a -t len -i src`), joined with concat —
 *     removed ranges are never decoded, so a long source stays cheap
 *   • shape: original / 9:16 / 1:1 / 4:5 / 16:9, either the whole picture over a blurred copy
 *     ('blur') or filling the frame ('crop', cropX / cropY choose the part kept)
 *   • quality: full (1080 short side) or 720; optional file-size cap (bitrate from the length)
 *   • overlay PNG (title / logo / source band, 1080×1920) only for the NaHaber 9:16 layout
 *   • the nahaber.com closing card + sting appended at the end (scaled to the clip)
 *
 * Output: H.264 High yuv420p 30 fps, 2 s GOP, AAC 128 k 48 kHz stereo, moov first.
 */
import { CLIP_OUTRO_S, keptRanges, type ClipOptions, type ClipOutro, type MsRange } from './mediaProject'

export interface EditArgsInput {
  input: string
  output: string
  startMs: number
  endMs: number
  cuts?: MsRange[]
  options: ClipOptions
  /** transparent 1080×1920 PNG (NaHaber 9:16 layout only) */
  overlay: string | null
  outro: ClipOutro | null
  /** whether the source has an audio stream */
  hasAudio: boolean
}

const SIZE: Record<Exclude<ClipOptions['frame'], 'original'>, [number, number]> = {
  vertical: [1080, 1920],
  square: [1080, 1080],
  portrait45: [1080, 1350],
  landscape: [1920, 1080],
}

/** Output size for a fixed frame (even numbers), or null for «original». */
export function frameSize(o: Pick<ClipOptions, 'frame' | 'quality'>): [number, number] | null {
  if (o.frame === 'original') return null
  const [w, h] = SIZE[o.frame]
  if (o.quality !== '720') return [w, h]
  const k = 720 / Math.min(w, h)
  const even = (n: number) => Math.round((n * k) / 2) * 2
  return [even(w), even(h)]
}

/** Video bitrate (bit/s) for a size cap over `seconds`, audio 128 k and 3 % container overhead taken out. */
export function bitrateForCap(maxMb: number, seconds: number): number {
  const total = (maxMb * 1024 * 1024 * 8 * 0.97) / Math.max(1, seconds)
  return Math.max(250_000, Math.round(total - 128_000))
}

export function clipEditArgs(a: EditArgsInput): string[] {
  const parts = keptRanges(a)
  const o = a.options
  const args = ['-hide_banner', '-loglevel', 'error', '-y']
  for (const p of parts) args.push('-ss', (p.startMs / 1000).toFixed(3), '-t', ((p.endMs - p.startMs) / 1000).toFixed(3), '-i', a.input)
  let next = parts.length
  const overlayIdx = a.overlay ? next++ : -1
  if (a.overlay) args.push('-loop', '1', '-i', a.overlay)
  const outroIdx = a.outro ? next++ : -1
  const S = CLIP_OUTRO_S.toFixed(2)
  if (a.outro) args.push('-loop', '1', '-framerate', '30', '-t', S, '-i', a.outro.image)
  const stingIdx = a.outro?.sting ? next++ : -1
  if (a.outro?.sting) args.push('-i', a.outro.sting)

  const fmtA = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
  const f: string[] = []
  // 1. each kept part, normalised, then joined
  parts.forEach((p, i) => {
    const len = ((p.endMs - p.startMs) / 1000).toFixed(3)
    f.push(`[${i}:v]fps=30,setsar=1,setpts=PTS-STARTPTS[pv${i}]`)
    f.push(a.hasAudio && !o.mute ? `[${i}:a]${fmtA},apad,atrim=0:${len},asetpts=N/SR/TB[pa${i}]` : `anullsrc=r=48000:cl=stereo,atrim=0:${len}[pa${i}]`)
  })
  f.push(`${parts.map((_, i) => `[pv${i}][pa${i}]`).join('')}concat=n=${parts.length}:v=1:a=1[jv][ja]`)

  // 2. shape
  const size = frameSize(o)
  const fullSize = o.frame === 'original' ? null : SIZE[o.frame]
  if (!size || !fullSize) {
    const cap = o.quality === '720' ? 1280 : 1920
    f.push(`[jv]scale='if(gte(iw,ih),min(${cap},iw),-2)':'if(gte(iw,ih),-2,min(${cap},ih))':force_divisible_by=2[shaped]`)
  } else {
    const [W, H] = fullSize
    if (o.fit === 'crop') {
      const x = (o.cropX ?? 0.5).toFixed(2)
      const y = (o.cropY ?? 0.5).toFixed(2)
      f.push(`[jv]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-${W})*${x}:(ih-${H})*${y}[s0]`)
    } else {
      f.push(
        `[jv]split=2[ba][fa];[ba]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.08[bg];` +
          `[fa]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[s0]`,
      )
    }
    let cur = 's0'
    if (a.overlay && o.frame === 'vertical' && o.fit !== 'crop') {
      f.push(`[${cur}][${overlayIdx}:v]overlay=0:0:shortest=1:format=auto[s1]`)
      cur = 's1'
    }
    f.push(size[0] !== W ? `[${cur}]scale=${size[0]}:${size[1]}[shaped]` : `[${cur}]null[shaped]`)
  }
  f.push('[shaped]format=yuv420p,setsar=1[main]')

  // 3. closing card
  if (a.outro) {
    f.push(`[${outroIdx}:v]fps=30,format=yuv420p[oimg];[oimg][main]scale2ref=w=iw:h=ih[os][mainr]`)
    f.push(`[os]setsar=1,fade=t=in:st=0:d=0.35[ov]`)
    f.push(
      a.outro.sting
        ? `[${stingIdx}:a]${fmtA},apad,atrim=0:${S},afade=t=out:st=${(CLIP_OUTRO_S - 0.4).toFixed(2)}:d=0.4,asetpts=N/SR/TB[oa]`
        : `anullsrc=r=48000:cl=stereo,atrim=0:${S}[oa]`,
    )
    f.push(`[mainr][ja][ov][oa]concat=n=2:v=1:a=1[v][a]`)
  } else {
    f.push('[main]null[v];[ja]anull[a]')
  }

  args.push('-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]')
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-r', '30')
  if (o.maxMb) {
    const seconds = parts.reduce((n, p) => n + (p.endMs - p.startMs), 0) / 1000 + (a.outro ? CLIP_OUTRO_S : 0)
    const br = bitrateForCap(o.maxMb, seconds)
    args.push('-b:v', String(br), '-maxrate', String(Math.round(br * 1.15)), '-bufsize', String(br * 2))
  } else {
    args.push('-crf', o.quality === '720' ? '23' : '21')
  }
  args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', a.output)
  return args
}
