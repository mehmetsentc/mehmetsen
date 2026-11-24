/**
 * MEDIA-1 — Medya projesi (pure, browser-safe).
 *
 * A media project is a news-independent piece of media prepared in the Reels
 * Studio: one rights-recorded source video from the Video Kütüphanesi, cut into
 * one or more clips. Each clip is rendered on its own and shared on its own
 * through the shared publish ledger (record key `media_<projectId>_<clipId>`).
 *
 *   frame 'original' — the clip as filmed: no crop, no text, no logo (only
 *                      re-encoded to a platform-safe MP4: H.264/AAC, 30 fps)
 *   frame 'vertical' — 1080×1920: the video fitted over a blurred copy of
 *                      itself, with optional title band, logo and source label
 *
 * Rights: every project carries a rights record. «İnternetten bulundu» (no
 * permission) can be prepared but never shared.
 */

export const MEDIA_PROJECTS = 'mediaProjects'

export const CLIP_MIN_MS = 3_000
/** Longest clip (kept time, after removed ranges): YouTube Shorts limit and the studio's render budget. */
export const CLIP_MAX_MS = 180_000
/** VIDEO-KES: a clip's range may span more of a long video when middle parts are removed. */
export const RANGE_MAX_MS = 30 * 60_000
export const MAX_CUTS = 10
/** Smallest removed range / smallest piece kept between removed ranges. */
export const CUT_MIN_MS = 300
export const MAX_MB_RANGE = [5, 500] as const
export const MAX_CLIPS = 12
export const TITLE_MAX = 140
export const CAPTION_MAX = 2000
export const SOURCE_NAME_MAX = 120
export const RIGHTS_NOTE_MAX = 500
export const PRESET_SECONDS = [15, 30, 60, 90] as const

export const RIGHTS_KINDS = ['owned', 'licensed', 'partner', 'permission', 'user_submitted', 'public_institution', 'found_online'] as const
export type RightsKind = (typeof RIGHTS_KINDS)[number]

export const RIGHTS_TEXT: Record<RightsKind, string> = {
  owned: 'NaHaber çekimi (sahibi biziz)',
  licensed: 'Lisanslı (ajans / satın alınmış)',
  partner: 'Partner içeriği',
  permission: 'Sahibinden yazılı izin alındı',
  user_submitted: 'Kullanıcı gönderdi, paylaşım izni verdi',
  public_institution: 'Kamu kurumu yayını (kaynak gösterilerek)',
  found_online: 'İnternetten bulundu — izin yok',
}

export interface MediaRights {
  kind: RightsKind
  /** Who owns / supplied the footage (shown as «Kaynak:» unless owned). */
  sourceName: string | null
  /** Where the permission is recorded (mail, contract no, message) — never a document body. */
  note: string | null
}

/**
 * VIDEO-KES: output shape. 'vertical' 9:16, 'square' 1:1, 'portrait45' 4:5, 'landscape' 16:9;
 * 'original' keeps the filmed shape.
 */
export type ClipFrame = 'original' | 'vertical' | 'square' | 'portrait45' | 'landscape'
export const CLIP_FRAMES: ClipFrame[] = ['vertical', 'square', 'portrait45', 'landscape', 'original']
/** 'blur': the whole picture over a blurred copy of itself; 'crop': fill the frame (cropX / cropY choose the part kept). */
export type ClipFit = 'blur' | 'crop'
export type ClipQuality = 'auto' | '720'

export interface ClipOptions {
  frame: ClipFrame
  /** VIDEO-KES (optional; absent = 'blur', centre, full quality, no size cap) */
  fit?: ClipFit
  /** 0 = left / top, 1 = right / bottom, 0.5 = centre (crop only) */
  cropX?: number
  cropY?: number
  quality?: ClipQuality
  /** Target file size cap in MB (null = quality-based) */
  maxMb?: number | null
  /** HABER-VIDEO: false = no nahaber.com closing card (only for a news item's own video shown on nahaber.com) */
  outro?: false
  /** Title band text over the video (vertical frame only). */
  showTitle: boolean
  showLogo: boolean
  showSource: boolean
  mute: boolean
}

export const DEFAULT_CLIP_OPTIONS: ClipOptions = { frame: 'vertical', showTitle: true, showLogo: true, showSource: true, mute: false }

export type ClipStatus = 'draft' | 'ready' | 'failed'
export interface MsRange {
  startMs: number
  endMs: number
}

export interface MediaClip {
  id: string
  name: string
  startMs: number
  endMs: number
  /** VIDEO-KES: ranges removed from inside [startMs, endMs]; the rest is joined. */
  cuts?: MsRange[]
  title: string
  options: ClipOptions
  status: ClipStatus
  /** Hash of everything that changes the rendered file; a changed clip needs a new render. */
  renderKey: string | null
  outputUrl: string | null
  coverUrl: string | null
  seconds: number | null
  error: string | null
  renderedAt: number | null
}

export interface MediaProject {
  id: string
  title: string
  caption: string
  videoItemId: string
  videoTitle: string | null
  /** Public playback URL of the library file (studio preview only). */
  sourceUrl: string | null
  durationMs: number | null
  posterUrl: string | null
  rights: MediaRights
  /** Optional: a NaHaber news item this media belongs to (adds the article link to captions). */
  linkedNewsId: string | null
  /** HABER-VIDEO: 'news' = the source is the news item's own uploaded video file (not a library item). */
  sourceKind?: 'library' | 'news'
  /** HABER-VIDEO: the news video file the project was made from (the original, never the edited one). */
  sourceFileUrl?: string | null
  /** HABER-VIDEO: the clip currently shown on the news page instead of the original. */
  newsApplied?: { clipId: string; url: string; at: number; by: string } | null
  clips: MediaClip[]
  createdBy: string
  createdAt: number
  updatedAt: number
}

// ── validation ───────────────────────────────────────────────────────────────

const ID_RE = /^[A-Za-z0-9_-]{4,64}$/
const CLIP_ID_RE = /^[a-z0-9]{4,16}$/
export const isProjectId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)
export const isClipId = (v: unknown): v is string => typeof v === 'string' && CLIP_ID_RE.test(v)

function text(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '').trim().slice(0, max)
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string; message: string }
const bad = <T,>(field: string, message: string): Parsed<T> => ({ ok: false, field, message })

export function parseRights(raw: unknown): Parsed<MediaRights> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const kind = r.kind
  if (!(RIGHTS_KINDS as readonly unknown[]).includes(kind)) return bad('rights.kind', 'Videonun kullanım hakkı seçilmeli')
  const sourceName = text(r.sourceName, SOURCE_NAME_MAX) || null
  const note = text(r.note, RIGHTS_NOTE_MAX) || null
  if (kind !== 'owned' && !sourceName) return bad('rights.sourceName', 'Kaynak (video sahibi) yazılmalı')
  if ((kind === 'permission' || kind === 'user_submitted' || kind === 'licensed') && !note) return bad('rights.note', 'İznin / lisansın nerede kayıtlı olduğu yazılmalı')
  return { ok: true, value: { kind: kind as RightsKind, sourceName, note } }
}

export function parseClipOptions(raw: unknown): ClipOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const frame: ClipFrame = (CLIP_FRAMES as unknown[]).includes(o.frame) ? (o.frame as ClipFrame) : 'vertical'
  const flag = (k: keyof ClipOptions, d: boolean) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : d)
  const fit: ClipFit = frame !== 'original' && o.fit === 'crop' ? 'crop' : 'blur'
  // Title / logo / source band: only the NaHaber 9:16 layout (whole picture over its blurred copy).
  const layout = frame === 'vertical' && fit === 'blur'
  const out: ClipOptions = {
    frame,
    showTitle: layout ? flag('showTitle', DEFAULT_CLIP_OPTIONS.showTitle) : false,
    showLogo: layout ? flag('showLogo', DEFAULT_CLIP_OPTIONS.showLogo) : false,
    showSource: layout ? flag('showSource', DEFAULT_CLIP_OPTIONS.showSource) : false,
    mute: flag('mute', false),
  }
  // VIDEO-KES extras are stored only when they differ from the defaults (older clips keep their render key).
  if (fit === 'crop') {
    out.fit = 'crop'
    const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 100) / 100 : 0.5)
    const x = pos(o.cropX)
    const y = pos(o.cropY)
    if (x !== 0.5) out.cropX = x
    if (y !== 0.5) out.cropY = y
  }
  if (o.quality === '720') out.quality = '720'
  if (o.outro === false) out.outro = false
  if (typeof o.maxMb === 'number' && Number.isFinite(o.maxMb)) out.maxMb = Math.round(Math.min(MAX_MB_RANGE[1], Math.max(MAX_MB_RANGE[0], o.maxMb)))
  return out
}

/** VIDEO-KES: the parts of [startMs, endMs] that stay (removed ranges taken out), in order. */
export function keptRanges(c: Pick<MediaClip, 'startMs' | 'endMs' | 'cuts'>): MsRange[] {
  const cuts = [...(c.cuts ?? [])].sort((a, b) => a.startMs - b.startMs)
  const out: MsRange[] = []
  let at = c.startMs
  for (const x of cuts) {
    const a = Math.max(at, x.startMs)
    const b = Math.min(c.endMs, x.endMs)
    if (b <= a) continue
    if (a - at >= CUT_MIN_MS) out.push({ startMs: at, endMs: a })
    at = b
  }
  if (c.endMs - at >= CUT_MIN_MS || !out.length) out.push({ startMs: at, endMs: Math.max(at, c.endMs) })
  return out
}

/** Seconds of video a clip yields (without the closing card). */
export function clipSeconds(c: Pick<MediaClip, 'startMs' | 'endMs' | 'cuts'>): number {
  return keptRanges(c).reduce((n, r) => n + (r.endMs - r.startMs), 0) / 1000
}

/** One clip from client input; `durationMs` (when known) bounds the range. Render fields are server-owned. */
export function parseClipInput(raw: unknown, durationMs: number | null, prev?: MediaClip): Parsed<Omit<MediaClip, 'status' | 'renderKey' | 'outputUrl' | 'coverUrl' | 'seconds' | 'error' | 'renderedAt'>> {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const id = c.id
  if (!isClipId(id)) return bad('clips.id', 'Bölüm kimliği geçersiz')
  const startMs = typeof c.startMs === 'number' && Number.isFinite(c.startMs) ? Math.round(c.startMs) : NaN
  const endMs = typeof c.endMs === 'number' && Number.isFinite(c.endMs) ? Math.round(c.endMs) : NaN
  if (!(startMs >= 0) || !(endMs > startMs)) return bad('clips.range', 'Bölümün başlangıç ve bitişi geçersiz')
  if (durationMs && endMs > durationMs + 250) return bad('clips.range', 'Bölüm videonun süresini aşıyor')
  if (endMs - startMs > RANGE_MAX_MS) return bad('clips.range', 'Bölümün aralığı en fazla 30 dakika olabilir')
  const end = durationMs ? Math.min(endMs, durationMs) : endMs
  // removed ranges: inside the clip, merged, at most MAX_CUTS
  const rawCuts = Array.isArray(c.cuts) ? c.cuts : []
  if (rawCuts.length > MAX_CUTS) return bad('clips.cuts', `Bir bölümden en fazla ${MAX_CUTS} aralık çıkarılabilir`)
  const cuts: MsRange[] = []
  for (const r of rawCuts) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const a = typeof o.startMs === 'number' && Number.isFinite(o.startMs) ? Math.round(o.startMs) : NaN
    const b = typeof o.endMs === 'number' && Number.isFinite(o.endMs) ? Math.round(o.endMs) : NaN
    if (!(a >= startMs) || !(b <= end) || b - a < CUT_MIN_MS) return bad('clips.cuts', 'Çıkarılan aralık bölümün içinde ve en az 0,3 sn olmalı')
    cuts.push({ startMs: a, endMs: b })
  }
  cuts.sort((x, y) => x.startMs - y.startMs)
  const merged: MsRange[] = []
  for (const x of cuts) {
    const last = merged[merged.length - 1]
    if (last && x.startMs <= last.endMs) last.endMs = Math.max(last.endMs, x.endMs)
    else merged.push({ ...x })
  }
  const kept = clipSeconds({ startMs, endMs: end, cuts: merged }) * 1000
  if (kept < CLIP_MIN_MS) return bad('clips.range', 'Bölüm (çıkarılanlardan sonra) en az 3 saniye olmalı')
  if (kept > CLIP_MAX_MS) return bad('clips.range', 'Bölüm (çıkarılanlardan sonra) en fazla 3 dakika olabilir')
  return {
    ok: true,
    value: {
      id,
      name: text(c.name, 80) || prev?.name || 'Bölüm',
      startMs,
      endMs: end,
      ...(merged.length ? { cuts: merged } : {}),
      title: text(c.title, TITLE_MAX),
      options: parseClipOptions(c.options),
    },
  }
}

// ── render identity ──────────────────────────────────────────────────────────

/** Deterministic key of everything that changes the rendered file (FNV-1a, 8 hex). */
export function clipRenderKey(videoItemId: string, clip: Pick<MediaClip, 'startMs' | 'endMs' | 'title' | 'options' | 'cuts'>, sourceLabel: string | null): string {
  const o = clip.options
  const base: unknown[] = [videoItemId, clip.startMs, clip.endMs, o.frame, o.showTitle ? clip.title : '', o.showLogo, o.showSource ? sourceLabel ?? '' : '', o.mute, 'v2-outro']
  // VIDEO-KES: only present when used, so clips made before keep their key (and their file)
  const extra = [clip.cuts?.length ? clip.cuts.map((c) => [c.startMs, c.endMs]) : null, o.fit === 'crop' ? ['crop', o.cropX ?? 0.5, o.cropY ?? 0.5] : null, o.quality === '720' ? '720' : null, o.maxMb ?? null, o.outro === false ? 'no-outro' : null]
  const s = JSON.stringify(extra.some((x) => x !== null) ? [...base, 'kes1', ...extra] : base)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Clip state after an edit: a changed render key drops the old output (it no longer matches). */
export function clipAfterEdit(next: Omit<MediaClip, 'status' | 'renderKey' | 'outputUrl' | 'coverUrl' | 'seconds' | 'error' | 'renderedAt'>, prev: MediaClip | undefined, videoItemId: string, sourceLabel: string | null): MediaClip {
  const key = clipRenderKey(videoItemId, next, sourceLabel)
  if (prev && prev.renderKey === key && prev.status === 'ready') return { ...prev, ...next }
  return { ...next, status: 'draft', renderKey: null, outputUrl: null, coverUrl: null, seconds: null, error: null, renderedAt: null }
}

export function sourceLabelFor(r: MediaRights): string | null {
  return r.kind === 'owned' ? null : r.sourceName
}

// ── sharing rules ────────────────────────────────────────────────────────────

export type MediaShareFormat = 'reel' | 'video_story'
export type MediaSharePlatform = 'facebook' | 'instagram' | 'threads' | 'youtube'

/** Platform duration limits for publishing via API (Meta / YouTube docs, Nov 2026). */
export const PLATFORM_LIMITS: Record<MediaSharePlatform, { reelMaxSec: number; storyMaxSec: number | null }> = {
  instagram: { reelMaxSec: 15 * 60, storyMaxSec: 60 },
  facebook: { reelMaxSec: 90, storyMaxSec: 60 },
  threads: { reelMaxSec: 300, storyMaxSec: null },
  youtube: { reelMaxSec: 180, storyMaxSec: null },
}

/** Why this clip may not go to this platform/format (null = allowed). */
export function shareProblem(p: Pick<MediaProject, 'rights'>, clip: Pick<MediaClip, 'startMs' | 'endMs' | 'status' | 'outputUrl' | 'cuts'>, platform: MediaSharePlatform, format: MediaShareFormat): string | null {
  if (p.rights.kind === 'found_online') return 'Bu videonun paylaşım izni yok («İnternetten bulundu»). Sahibinden izin alın veya kendi videonuzu kullanın.'
  if (clip.status !== 'ready' || !clip.outputUrl) return 'Önce bu bölümü üretin'
  const sec = clipSeconds(clip)
  const lim = PLATFORM_LIMITS[platform]
  if (format === 'video_story') {
    if (lim.storyMaxSec === null) return `${PLATFORM_NAME[platform]} video hikâyesi desteklemez`
    if (sec > lim.storyMaxSec) return `${PLATFORM_NAME[platform]} hikâyesi en fazla ${lim.storyMaxSec} sn`
    return null
  }
  if (sec > lim.reelMaxSec) return `${PLATFORM_NAME[platform]} için en fazla ${lim.reelMaxSec >= 120 ? `${lim.reelMaxSec / 60} dk` : `${lim.reelMaxSec} sn`}`
  // YouTube: a Short over 60 s with any copyright claim is blocked worldwide.
  if (platform === 'youtube' && sec > 60 && p.rights.kind !== 'owned') return 'YouTube: başkasına ait görüntü 60 sn’yi geçmemeli (telif talebinde 1 dk üstü Short tamamen engellenir)'
  return null
}

export const PLATFORM_NAME: Record<MediaSharePlatform, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', youtube: 'YouTube' }

/** Caption: the project text, the article link when linked, and the source line for footage we do not own. */
export function mediaCaption(p: Pick<MediaProject, 'caption' | 'title' | 'rights'>, clip: Pick<MediaClip, 'title'>, articleUrl: string | null): string {
  const body = p.caption.trim() || clip.title.trim() || p.title.trim()
  const src = p.rights.kind !== 'owned' && p.rights.sourceName ? `Kaynak: ${p.rights.sourceName}` : ''
  return [body, articleUrl ? `Haberin tamamı: ${articleUrl}` : '', src].filter(Boolean).join('\n\n').slice(0, 2200)
}

/** Ledger key of one clip (each clip is its own post on each account). */
export function mediaLedgerKey(projectId: string, clipId: string): string {
  return `media_${projectId}_${clipId}`.slice(0, 128)
}

// ── ffmpeg (pure argv; the renderer spawns it without a shell) ───────────────

export const OUT_W = 1080
export const OUT_H = 1920

/**
 * ffmpeg argv for one clip. Input 0 = source video; input 1 = overlay PNG
 * (1080×1920, transparent) only when the vertical frame has text / logo.
 * Output: H.264 High, yuv420p, 30 fps fixed, 2 s closed GOP, AAC 128 k 48 kHz
 * stereo, moov atom first — inside every platform's API requirements.
 */
/** OUTRO-ALL: the nahaber.com closing card appended to every clip. */
export const CLIP_OUTRO_S = 2.6
export interface ClipOutro {
  /** Still image (JPEG/PNG) of the closing card; scaled to the clip's size. */
  image: string
  /** Short closing sting (WAV) or null for silence. */
  sting: string | null
  /** Whether the source has an audio stream (else silence is generated). */
  hasAudio: boolean
}

export function clipFfmpegArgs(a: { input: string; overlay: string | null; output: string; startMs: number; endMs: number; options: ClipOptions; outro?: ClipOutro | null }): string[] {
  const ss = (a.startMs / 1000).toFixed(3)
  const t = ((a.endMs - a.startMs) / 1000).toFixed(3)
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', ss, '-t', t, '-i', a.input]
  const vertical = a.options.frame === 'vertical'
  const overlay = vertical && a.overlay
  if (overlay) args.push('-loop', '1', '-t', t, '-i', a.overlay!)
  let filter: string
  if (vertical) {
    filter =
      `[0:v]fps=30,split=2[a][b];` +
      `[a]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},boxblur=24:2,eq=brightness=-0.08[bg];` +
      `[b]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg];` +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2` +
      (overlay ? `[v0];[v0][1:v]overlay=0:0:format=auto,format=yuv420p[v]` : `,format=yuv420p[v]`)
  } else {
    // As filmed: only bounded to the platforms' 1920 px maximum width, even dimensions.
    filter = `[0:v]fps=30,scale='min(1920,iw)':-2:force_divisible_by=2,format=yuv420p[v]`
  }
  const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-profile:v', 'high', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-r', '30']
  if (a.outro) {
    // main part ends in [vm]; the card is scaled to the same size and concatenated with its sting
    const o = a.outro
    const S = CLIP_OUTRO_S.toFixed(2)
    const oi = overlay ? 2 : 1
    args.push('-loop', '1', '-framerate', '30', '-t', S, '-i', o.image)
    const si = o.sting ? oi + 1 : -1
    if (o.sting) args.push('-i', o.sting)
    const fmtA = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
    const mainA = o.hasAudio && !a.options.mute ? `[0:a]${fmtA},apad,atrim=0:${t},asetpts=N/SR/TB[am]` : `anullsrc=r=48000:cl=stereo,atrim=0:${t}[am]`
    const outA = o.sting ? `[${si}:a]${fmtA},apad,atrim=0:${S},afade=t=out:st=${(CLIP_OUTRO_S - 0.4).toFixed(2)}:d=0.4,asetpts=N/SR/TB[ao]` : `anullsrc=r=48000:cl=stereo,atrim=0:${S}[ao]`
    const vf =
      filter.replace(/\[v\]$/, '[vm0]') +
      `;[vm0]trim=duration=${t},setpts=PTS-STARTPTS,setsar=1[vmt]` +
      `;[${oi}:v]fps=30,format=yuv420p[oimg];[oimg][vmt]scale2ref=w=iw:h=ih[os][vmr]` +
      `;[os]setsar=1,fade=t=in:st=0:d=0.35[ov]` +
      `;${mainA};${outA};[vmr][am][ov][ao]concat=n=2:v=1:a=1[v][a]`
    args.push('-filter_complex', vf, '-map', '[v]', '-map', '[a]')
    args.push(...enc)
    args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', a.output)
    return args
  }
  args.push('-filter_complex', filter, '-map', '[v]', '-map', '0:a?')
  args.push(...enc)
  if (a.options.mute) args.push('-af', 'volume=0')
  args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', a.output)
  return args
}
