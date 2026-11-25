/**
 * KURGU — ffmpeg argv for a whole edit project (pure; the renderer spawns it without a shell).
 *
 * Each clip: crop → flip → speed → filter / adjust → rotate → placed on the canvas
 * (cover / contain / over its blurred copy, scale + position) → in / out animation.
 * Clips are joined with xfade (a 40 ms fade stands in for a plain cut) and acrossfade,
 * text overlays (PNG, full canvas) are shown in their time window, music and voice-over
 * are mixed in, and the nahaber.com closing card is appended unless switched off.
 * Output: H.264 High yuv420p 30 fps, AAC 128 k 48 kHz stereo, moov first.
 */
import { CLOSING_MS, clipMs, timeline, type AudioItem, type TextItem, type VideoClip } from './editProject'

export interface BuildClip {
  clip: VideoClip
  kind: 'video' | 'image'
  path: string
  hasAudio: boolean
  /** HDR kaynak (iPhone HLG / PQ): SDR'ye çevrilmezse renkler soluk, gri görünür */
  hdr?: HdrKind
}

export type HdrKind = 'hlg' | 'pq' | null

/** ffmpeg -i çıktısından HDR aktarım eğrisi (iPhone: HLG = arib-std-b67; PQ = smpte2084). */
export function hdrKindOf(ffmpegInfo: string): HdrKind {
  const v = ffmpegInfo.match(/Stream #\d+:\d+[^\n]*Video:[^\n]*/)?.[0] ?? ''
  if (/arib-std-b67/.test(v)) return 'hlg'
  if (/smpte2084/.test(v)) return 'pq'
  return null
}

/**
 * HDR → SDR (BT.709). HLG SDR ile geriye uyumlu: doğrudan dönüşüm doğru renk verir ve hızlıdır.
 * PQ için ton eşleme gerekir (hable).
 */
export function hdrToSdrFilters(hdr: HdrKind): string[] {
  if (hdr === 'hlg') return ['zscale=tin=arib-std-b67:pin=bt2020:min=bt2020nc:t=bt709:p=bt709:m=bt709:r=tv', 'format=yuv420p']
  if (hdr === 'pq')
    return [
      'zscale=tin=smpte2084:pin=bt2020:min=bt2020nc:t=linear:npl=100',
      'format=gbrpf32le',
      'zscale=p=bt709',
      'tonemap=tonemap=hable:desat=0',
      'zscale=t=bt709:m=bt709:r=tv',
      'format=yuv420p',
    ]
  return []
}
export interface BuildInput {
  W: number
  H: number
  clips: BuildClip[]
  /** x / y: kırpılmış bindirmenin sol üst köşesi (yoksa tam kare, 0:0) */
  texts: Array<{ item: TextItem; png: string; x?: number; y?: number }>
  audio: Array<{ item: AudioItem; path: string; loop: boolean }>
  outro: { image: string; sting: string | null } | null
  output: string
  /** klibin kendi sesi seslendirme konuşurken kısılır (sidechain) */
  duckUnderVoice?: boolean
  /** H.264 CRF (düşük = daha kaliteli, daha büyük dosya). Varsayılan 21. */
  crf?: number
}

const sec = (ms: number) => (ms / 1000).toFixed(3)
const FMT_A = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'

function atempo(speed: number): string[] {
  const out: string[] = []
  let s = speed
  while (s > 2) {
    out.push('atempo=2')
    s /= 2
  }
  while (s < 0.5) {
    out.push('atempo=0.5')
    s /= 0.5
  }
  if (Math.abs(s - 1) > 0.001) out.push(`atempo=${s.toFixed(4)}`)
  return out
}

/** Colour of a filter preset combined with the clip's own adjustments. */
export function colourFilters(c: Pick<VideoClip, 'brightness' | 'contrast' | 'saturation' | 'filter'>): string[] {
  let b = c.brightness
  let k = c.contrast
  let s = c.saturation
  const extra: string[] = []
  switch (c.filter) {
    case 'canli':
      s *= 1.35
      k *= 1.08
      break
    case 'sicak':
      extra.push('colorbalance=rs=0.08:gs=0.02:bs=-0.08')
      break
    case 'soguk':
      extra.push('colorbalance=rs=-0.08:bs=0.1')
      break
    case 'siyahbeyaz':
      s = 0
      break
    case 'sinema':
      k *= 1.15
      s *= 0.85
      extra.push('colorbalance=rs=0.05:bs=-0.03')
      break
    case 'solgun':
      k *= 0.85
      s *= 0.7
      b += 0.04
      break
  }
  const out: string[] = []
  if (Math.abs(b) > 0.001 || Math.abs(k - 1) > 0.001 || Math.abs(s - 1) > 0.001) out.push(`eq=brightness=${b.toFixed(3)}:contrast=${k.toFixed(3)}:saturation=${s.toFixed(3)}`)
  return [...out, ...extra]
}

export function editFfmpegArgs(a: BuildInput): string[] {
  const { W, H } = a
  const tl = timeline(a.clips.map((c) => c.clip))
  const total = tl.total
  const args = ['-hide_banner', '-loglevel', 'error', '-y']
  // inputs: clips, texts, audio, outro
  for (const c of a.clips) {
    const d = clipMs(c.clip)
    if (c.kind === 'image') args.push('-loop', '1', '-framerate', '30', '-t', sec(d), '-i', c.path)
    else args.push('-ss', sec(c.clip.inMs), '-t', sec(c.clip.outMs - c.clip.inMs), '-i', c.path)
  }
  let n = a.clips.length
  const textIdx = a.texts.map(() => n++)
  // each text PNG is read only for its own window (was: the whole video per text → slow with many texts)
  const win = (t: { item: TextItem }) => {
    const from = Math.max(0, Math.min(t.item.startMs, total))
    const to = Math.max(from + 40, Math.min(t.item.endMs, total))
    return { from, to }
  }
  for (const t of a.texts) args.push('-loop', '1', '-framerate', '30', '-t', sec(win(t).to - win(t).from), '-i', t.png)
  const audioIdx = a.audio.map(() => n++)
  for (const x of a.audio) {
    if (x.loop) args.push('-stream_loop', '-1')
    args.push('-t', sec(total + 1000), '-i', x.path)
  }
  const outroIdx = a.outro ? n++ : -1
  const S = sec(CLOSING_MS)
  if (a.outro) args.push('-loop', '1', '-framerate', '30', '-t', S, '-i', a.outro.image)
  const stingIdx = a.outro?.sting ? n++ : -1
  if (a.outro?.sting) args.push('-i', a.outro.sting)

  const f: string[] = []
  // 1. every clip on its own canvas
  a.clips.forEach((bc, i) => {
    const c = bc.clip
    const D = clipMs(c) / 1000
    const pre: string[] = bc.kind === 'video' ? hdrToSdrFilters(bc.hdr ?? null) : []
    if (c.crop) pre.push(`crop=iw*${c.crop.w}:ih*${c.crop.h}:iw*${c.crop.x}:ih*${c.crop.y}`)
    if (c.flipH) pre.push('hflip')
    pre.push(bc.kind === 'video' && Math.abs(c.speed - 1) > 0.001 ? `setpts=(PTS-STARTPTS)/${c.speed}` : 'setpts=PTS-STARTPTS')
    pre.push('fps=30')
    pre.push(...colourFilters(c))
    if (c.rotate) {
      const r = ((c.rotate * Math.PI) / 180).toFixed(5)
      pre.push(`format=rgba,rotate=${r}:ow=rotw(${r}):oh=roth(${r}):c=none`)
    }
    const s = c.scale
    const mode = c.fit === 'cover' ? 'increase' : 'decrease'
    const fg = `scale=w=${Math.round(W * s)}:h=${Math.round(H * s)}:force_original_aspect_ratio=${mode}:force_divisible_by=2:flags=lanczos`
    if (c.fit === 'blur') {
      f.push(`[${i}:v]${pre.join(',')},split=2[cf${i}][cb${i}]`)
      f.push(`[cb${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.08,format=yuv420p[bg${i}]`)
      f.push(`[cf${i}]${fg}[fg${i}]`)
    } else {
      f.push(`[${i}:v]${pre.join(',')},${fg}[fg${i}]`)
      f.push(`color=c=black:s=${W}x${H}:r=30:d=${D.toFixed(3)}[bg${i}]`)
    }
    const post: string[] = [`trim=duration=${D.toFixed(3)}`, 'setpts=PTS-STARTPTS']
    // zoom animation: zoompan per output frame (on = frame number at 30 fps)
    const zIn = c.animIn === 'zoom' ? `0.12*max(0,1-on/18)` : '0'
    const zOut = c.animOut === 'zoom' ? `0.12*max(0,(on/30-${(D - 0.6).toFixed(3)})/0.6)` : '0'
    if (c.animIn === 'zoom' || c.animOut === 'zoom') post.push(`zoompan=z='1+${zIn}+${zOut}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30`)
    if (c.animIn === 'fade') post.push('fade=t=in:st=0:d=0.4')
    if (c.animOut === 'fade') post.push(`fade=t=out:st=${Math.max(0, D - 0.4).toFixed(3)}:d=0.4`)
    post.push('format=yuv420p', 'setsar=1', 'fps=30')
    f.push(`[bg${i}][fg${i}]overlay=x='(W-w)/2+${c.posX}*W/2':y='(H-h)/2+${c.posY}*H/2':eval=init,${post.join(',')}[v${i}]`)
    // audio of the clip
    const ad = D.toFixed(3)
    if (bc.kind === 'video' && bc.hasAudio && !c.mute && c.volume > 0) {
      const fx = [FMT_A, ...atempo(c.speed), `volume=${c.volume}`]
      if (c.animIn === 'fade') fx.push('afade=t=in:st=0:d=0.4')
      if (c.animOut === 'fade') fx.push(`afade=t=out:st=${Math.max(0, D - 0.4).toFixed(3)}:d=0.4`)
      f.push(`[${i}:a]${fx.join(',')},apad,atrim=0:${ad},asetpts=N/SR/TB[a${i}]`)
    } else {
      f.push(`anullsrc=r=48000:cl=stereo,atrim=0:${ad}[a${i}]`)
    }
  })

  // 2. join: xfade / acrossfade (a 40 ms fade for a plain cut keeps one code path)
  let pv = 'v0'
  let pa = 'a0'
  for (let i = 1; i < a.clips.length; i++) {
    const ov = tl.overlaps[i]! / 1000
    const off = tl.starts[i]! / 1000
    const tr = a.clips[i]!.clip.transition === 'none' ? 'fade' : a.clips[i]!.clip.transition
    f.push(`[${pv}][v${i}]xfade=transition=${tr}:duration=${ov.toFixed(3)}:offset=${off.toFixed(3)}[jv${i}]`)
    f.push(`[${pa}][a${i}]acrossfade=d=${ov.toFixed(3)}:c1=tri:c2=tri[ja${i}]`)
    pv = `jv${i}`
    pa = `ja${i}`
  }

  // 3. texts in their time window
  a.texts.forEach((t, k) => {
    const w = win(t)
    const from = (w.from / 1000).toFixed(3)
    const to = (w.to / 1000).toFixed(3)
    f.push(`[${textIdx[k]}:v]setpts=PTS-STARTPTS+${from}/TB[tx${k}]`)
    f.push(`[${pv}][tx${k}]overlay=${t.x ?? 0}:${t.y ?? 0}:eof_action=pass:enable='between(t,${from},${to})'[tv${k}]`)
    pv = `tv${k}`
  })
  f.push(`[${pv}]format=yuv420p,setsar=1[main]`)

  // 4. music + voice-over over the clips' own sound
  const mixIn = [`[${pa}]`]
  const duckK = a.duckUnderVoice ? a.audio.findIndex((x) => x.item.kind === 'voice') : -1
  a.audio.forEach((x, k) => {
    const it = x.item
    const end = Math.min(total, it.endMs ?? total)
    const len = Math.max(0.3, (end - it.startMs) / 1000)
    const fx = [FMT_A, `atrim=0:${len.toFixed(3)}`, 'asetpts=N/SR/TB', `volume=${it.volume}`]
    if (it.fade) fx.push(`afade=t=in:st=0:d=${Math.min(1, len / 4).toFixed(2)}`, `afade=t=out:st=${Math.max(0, len - Math.min(1.5, len / 3)).toFixed(3)}:d=${Math.min(1.5, len / 3).toFixed(2)}`)
    if (it.startMs > 0) fx.push(`adelay=${it.startMs}|${it.startMs}`)
    if (k === duckK) {
      // seslendirme hem karışıma hem «kısma» denetimine gider: konuşurken videonun sesi ~ −12 dB
      // apad: seslendirme bitince denetim sessiz kalır (yoksa çıktı seslendirmeyle birlikte kesilir)
      f.push(`[${audioIdx[k]}:a]${fx.join(',')},asplit=2[m${k}][scr${k}]`)
      f.push(`[scr${k}]apad[sc${k}]`)
      f.push(`[${pa}][sc${k}]sidechaincompress=threshold=0.025:ratio=8:attack=60:release=800:makeup=1[duck]`)
      mixIn[0] = '[duck]'
    } else f.push(`[${audioIdx[k]}:a]${fx.join(',')}[m${k}]`)
    mixIn.push(`[m${k}]`)
  })
  if (a.audio.length) f.push(`${mixIn.join('')}amix=inputs=${mixIn.length}:duration=first:normalize=0,atrim=0:${(total / 1000).toFixed(3)}[mix]`)
  else f.push(`[${pa}]anull[mix]`)

  // 5. closing card
  if (a.outro) {
    f.push(`[${outroIdx}:v]fps=30,format=yuv420p[oimg];[oimg][main]scale2ref=w=iw:h=ih[os][mainr]`)
    f.push('[os]setsar=1,fade=t=in:st=0:d=0.35[ov]')
    f.push(
      a.outro.sting
        ? `[${stingIdx}:a]${FMT_A},apad,atrim=0:${S},afade=t=out:st=${((CLOSING_MS - 400) / 1000).toFixed(2)}:d=0.4,asetpts=N/SR/TB[oa]`
        : `anullsrc=r=48000:cl=stereo,atrim=0:${S}[oa]`,
    )
    f.push('[mainr][mix][ov][oa]concat=n=2:v=1:a=1[v][a]')
  } else {
    f.push('[main]null[v];[mix]anull[a]')
  }

  args.push('-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]')
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(a.crf ?? 21), '-profile:v', 'high', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-r', '30')
  args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', a.output)
  return args
}
