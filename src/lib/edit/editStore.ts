import 'server-only'

/**
 * KURGU — edit project storage (Firestore `editProjects`, Admin SDK only; no scanning).
 */
import { randomBytes, createHash } from 'node:crypto'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { libraryVideoMeta } from '@/lib/media/mediaStore'
import {
  EDIT_PROJECTS,
  EMPTY_RENDER,
  MAX_ASSETS,
  MAX_AUDIO,
  MAX_TOTAL_MS,
  ASPECTS,
  cleanText,
  defaultClip,
  isEditProjectId,
  isItemId,
  newItemId,
  parseEdit,
  renderKeyFor,
  TITLE_MAX,
  type Aspect,
  type EditAsset,
  type EditProject,
  type RenderState,
} from './editProject'

const col = () => getAdminFirestore().collection(EDIT_PROJECTS)
const NEWS_ID_RE = /^[A-Za-z0-9_-]{4,128}$/
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`

export type StoreResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string; field?: string }
const fail = <T,>(status: number, code: string, message: string, field?: string): StoreResult<T> => ({ ok: false, status, code, message, ...(field ? { field } : {}) })

async function audit(uid: string, what: string, p: EditProject, extra: Record<string, unknown> = {}) {
  await writeSocialAudit({
    actorId: uid,
    action: 'video.edit.save',
    entityType: 'editProject',
    entityId: p.id,
    meta: { what, clips: p.clips.length, texts: p.texts.length, audio: p.audio.length, assets: p.assets.length, linkedNewsId: p.linkedNewsId, ...extra },
  })
}

const withDefaults = (p: EditProject): EditProject => ({ ...p, texts: p.texts ?? [], audio: p.audio ?? [], assets: p.assets ?? [], clips: p.clips ?? [], render: p.render ?? { ...EMPTY_RENDER }, newsApplied: p.newsApplied ?? null })

export async function getEditProject(id: string): Promise<EditProject | null> {
  if (!isEditProjectId(id)) return null
  const s = await col().doc(id).get()
  return s.exists ? withDefaults(s.data() as EditProject) : null
}

export async function listEditProjects(limit = 60): Promise<EditProject[]> {
  const snap = await col().orderBy('updatedAt', 'desc').limit(limit).get()
  return snap.docs.map((d) => withDefaults(d.data() as EditProject))
}

function blank(uid: string, now: number, over: Partial<EditProject> = {}): EditProject {
  return {
    id: `ep${randomBytes(8).toString('hex')}`,
    title: 'Yeni proje',
    caption: '',
    aspect: '9:16',
    assets: [],
    clips: [],
    texts: [],
    audio: [],
    closing: true,
    linkedNewsId: null,
    newsVideo: false,
    newsApplied: null,
    render: { ...EMPTY_RENDER },
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

export async function createEditProject(uid: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<EditProject>> {
  const aspect = (ASPECTS as readonly unknown[]).includes(raw.aspect) ? (raw.aspect as Aspect) : '9:16'
  const p = blank(uid, now, { title: cleanText(raw.title, TITLE_MAX) || `Proje ${new Date(now).toLocaleDateString('tr-TR')}`, aspect })
  await col().doc(p.id).set(p)
  await audit(uid, 'create', p)
  return { ok: true, value: p }
}

// ── media ────────────────────────────────────────────────────────────────────

/** Remote video duration from the ffmpeg banner (no download). */
async function probeDurationMs(url: string): Promise<number | null> {
  try {
    const { spawn } = await import('node:child_process')
    const mod = (await import('ffmpeg-static')) as unknown as { default?: string | null } | string
    const bin = process.env.FFMPEG_PATH || (typeof mod === 'string' ? mod : mod.default)
    if (!bin) return null
    return await new Promise((resolve) => {
      const p = spawn(bin, ['-hide_banner', '-i', url], { stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      const timer = setTimeout(() => p.kill('SIGKILL'), 20_000)
      p.stderr!.on('data', (d) => {
        if (err.length < 20_000) err += String(d)
      })
      p.on('close', () => {
        clearTimeout(timer)
        const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
        resolve(m ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) : null)
      })
      p.on('error', () => (clearTimeout(timer), resolve(null)))
    })
  } catch {
    return null
  }
}

async function newsMedia(newsId: string): Promise<StoreResult<{ title: string; video: string | null; images: string[]; poster: string | null; d: Record<string, unknown> }>> {
  if (!NEWS_ID_RE.test(newsId)) return fail(400, 'invalid_news', 'Haber kimliği geçersiz')
  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
  if (!snap.exists) return fail(404, 'news_not_found', 'Haber bulunamadı — yeni haberse önce kaydedin')
  const d = snap.data() as Record<string, unknown>
  const { resolveNewsVideo } = await import('@/lib/social/newsVideo')
  const { reelPhotoUrlsFromDoc } = await import('@/lib/reels/reelService')
  const { extractImageUrl } = await import('@/lib/social/publishOneSocial')
  const v = resolveNewsVideo(d)
  const original = d.videoOriginal && typeof d.videoOriginal === 'object' ? (d.videoOriginal as Record<string, unknown>) : null
  const origUrl = original ? [original.playbackUrl, original.videoUrl].find((x): x is string => typeof x === 'string' && /^https:\/\//.test(x)) ?? null : null
  const cover = extractImageUrl(d) ?? null
  return {
    ok: true,
    value: {
      title: (typeof d.title === 'string' ? d.title : 'Haber').trim().slice(0, TITLE_MAX),
      video: origUrl ?? (v.kind === 'file' ? v.url : null),
      images: reelPhotoUrlsFromDoc(d, cover).slice(0, 8),
      poster: cover,
      d,
    },
  }
}

function ownUploadUrl(url: unknown, uid: string, projectId: string): url is string {
  if (typeof url !== 'string' || url.length > 2000) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || !/(^|\.)firebasestorage\.googleapis\.com$|(^|\.)storage\.googleapis\.com$/.test(u.hostname)) return false
    const path = decodeURIComponent(u.pathname)
    return path.includes(`news-images/${uid}/edit/${projectId}/`) || path.includes(`news-videos/${uid}/edit/${projectId}/`)
  } catch {
    return false
  }
}

/** Add media: { kind:'library', videoItemId } · { kind:'upload', url, name, type:'image' } · { kind:'news', newsId } */
export async function addAssets(uid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<{ project: EditProject; added: EditAsset[] }>> {
  const p = await getEditProject(id)
  if (!p) return fail(404, 'not_found', 'Proje bulunamadı')
  const added: EditAsset[] = []
  if (raw.kind === 'library') {
    const m = await libraryVideoMeta(String(raw.videoItemId ?? ''))
    if (!m.ok) return m
    if (!m.value.url) return fail(409, 'video_missing', 'Videonun dosyası yok')
    added.push({ id: newItemId(), kind: 'video', source: 'library', url: m.value.url, libraryId: String(raw.videoItemId), name: m.value.title.slice(0, 80), durationMs: m.value.durationMs, posterUrl: m.value.posterUrl, addedAt: now })
  } else if (raw.kind === 'upload') {
    if (!ownUploadUrl(raw.url, uid, id)) return fail(400, 'invalid_url', 'Yüklenen dosyanın yeri geçersiz')
    const url = raw.url
    if (raw.type === 'video') {
      if (!decodeURIComponent(new URL(url).pathname).includes('news-videos/')) return fail(400, 'invalid_url', 'Video yeri geçersiz')
      const durationMs = await probeDurationMs(url)
      if (durationMs === null) return fail(422, 'video_unreadable', 'Video okunamadı (bozuk ya da desteklenmeyen biçim)')
      added.push({ id: newItemId(), kind: 'video', source: 'upload', url, name: cleanText(raw.name, 80) || 'Video', durationMs, posterUrl: null, addedAt: now })
    } else added.push({ id: newItemId(), kind: 'image', source: 'upload', url, name: cleanText(raw.name, 80) || 'Fotoğraf', durationMs: null, posterUrl: url, addedAt: now })
  } else if (raw.kind === 'news') {
    const n = await newsMedia(String(raw.newsId ?? ''))
    if (!n.ok) return n
    if (n.value.video) added.push({ id: newItemId(), kind: 'video', source: 'news', url: n.value.video, name: `${n.value.title.slice(0, 60)} — video`, durationMs: await probeDurationMs(n.value.video), posterUrl: n.value.poster, addedAt: now })
    n.value.images.forEach((u, i) => added.push({ id: newItemId(), kind: 'image', source: 'news', url: u, name: `${n.value.title.slice(0, 60)} — görsel ${i + 1}`, durationMs: null, posterUrl: u, addedAt: now }))
    if (!added.length) return fail(409, 'news_no_media', 'Haberde video ya da görsel yok')
  } else return fail(400, 'invalid_kind', 'Medya türü geçersiz')
  if (p.assets.length + added.length > MAX_ASSETS) return fail(409, 'too_many', `En fazla ${MAX_ASSETS} medya`)
  const ref = col().doc(id)
  const project = await getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    const cur = withDefaults(s.data() as EditProject)
    const next = { ...cur, assets: [...cur.assets, ...added], updatedAt: now }
    tx.set(ref, next)
    return next
  })
  await audit(uid, 'assets', project, { added: added.length })
  return { ok: true, value: { project, added } }
}

export async function removeAsset(uid: string, id: string, assetId: unknown, now: number): Promise<StoreResult<EditProject>> {
  if (!isItemId(assetId)) return fail(400, 'invalid_asset', 'Medya kimliği geçersiz')
  const p = await getEditProject(id)
  if (!p) return fail(404, 'not_found', 'Proje bulunamadı')
  if (p.clips.some((c) => c.assetId === assetId) || p.audio.some((a) => a.assetId === assetId)) return fail(409, 'asset_in_use', 'Bu medya zaman çizelgesinde kullanılıyor; önce klibi silin')
  const next = { ...p, assets: p.assets.filter((a) => a.id !== assetId), updatedAt: now }
  await col().doc(id).set(next)
  return { ok: true, value: next }
}

/** Save the timeline (clips / texts / audio), title, caption, aspect, closing. */
export async function updateEditProject(uid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<EditProject>> {
  const p = await getEditProject(id)
  if (!p) return fail(404, 'not_found', 'Proje bulunamadı')
  const m = parseEdit(raw, p)
  if (!m.ok) return fail(400, 'invalid', m.message, m.field)
  const next: EditProject = { ...p, ...m.value, updatedAt: now }
  await col().doc(id).set(next)
  return { ok: true, value: next }
}

export async function deleteEditProject(uid: string, id: string): Promise<boolean | 'news_applied'> {
  const p = await getEditProject(id)
  if (!p) return false
  if (p.newsApplied) return 'news_applied'
  await col().doc(id).delete()
  await audit(uid, 'delete', p)
  return true
}

/** Store a render result only when the project still has the same content. */
export async function setEditRendered(id: string, key: string, r: { outputUrl: string; coverUrl: string | null; seconds: number } | { error: string }, now: number): Promise<boolean> {
  const ref = col().doc(id)
  return getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return false
    const p = withDefaults(s.data() as EditProject)
    if (renderKeyFor(p) !== key) return false
    const render: RenderState = 'error' in r ? { ...EMPTY_RENDER, status: 'failed', error: r.error.slice(0, 300), renderedAt: now } : { status: 'ready', key, outputUrl: r.outputUrl, coverUrl: r.coverUrl, seconds: r.seconds, error: null, renderedAt: now }
    tx.update(ref, { render })
    return true
  })
}

// ── voice-over (TTS) ─────────────────────────────────────────────────────────

export async function addVoiceOver(uid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<EditProject>> {
  const p = await getEditProject(id)
  if (!p) return fail(404, 'not_found', 'Proje bulunamadı')
  if (p.audio.length >= MAX_AUDIO) return fail(409, 'too_many', `En fazla ${MAX_AUDIO} ses`)
  const text = cleanText(raw.text, 1500)
  if (text.length < 3) return fail(400, 'invalid_text', 'Seslendirilecek metni yazın')
  const voice = typeof raw.voice === 'string' && /^[A-Za-z0-9-]{3,60}$/.test(raw.voice) ? raw.voice : null
  const rate = typeof raw.rate === 'number' && raw.rate >= 0.7 && raw.rate <= 1.4 ? raw.rate : null
  const startMs = typeof raw.startMs === 'number' && raw.startMs >= 0 && raw.startMs < MAX_TOTAL_MS ? Math.round(raw.startMs) : 0
  const { synthesizeReelVoiceEx } = await import('@/lib/reels/voice')
  const { wav } = await synthesizeReelVoiceEx(text, AbortSignal.timeout(90_000), { voice, rate })
  const hash = createHash('sha256').update(`${voice}|${rate}|${text}`).digest('hex').slice(0, 16)
  const name = `edit/${id}/voice-${hash}.wav`
  const bucket = getAdminStorage().bucket(BUCKET)
  await bucket.file(name).save(wav, { resumable: false, metadata: { contentType: 'audio/wav', cacheControl: 'public, max-age=86400' } })
  await bucket.file(name).makePublic()
  const url = `https://storage.googleapis.com/${BUCKET}/${name}`
  // 16-bit mono/stereo PCM WAV: bytes / (rate × channels × 2)
  const sr = wav.readUInt32LE(24)
  const ch = wav.readUInt16LE(22)
  const durationMs = sr && ch ? Math.round(((wav.length - 44) / (sr * ch * 2)) * 1000) : null
  const asset: EditAsset = { id: newItemId(), kind: 'audio', source: 'tts', url, name: `Seslendirme: ${text.slice(0, 40)}`, durationMs, posterUrl: null, addedAt: now }
  const item = { id: newItemId(), kind: 'voice' as const, assetId: asset.id, music: null, text: text.slice(0, 2000), startMs, endMs: durationMs ? startMs + durationMs : null, volume: 1, fade: false }
  const ref = col().doc(id)
  const project = await getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    const cur = withDefaults(s.data() as EditProject)
    const next = { ...cur, assets: [...cur.assets, asset], audio: [...cur.audio, item], updatedAt: now }
    tx.set(ref, next)
    return next
  })
  await audit(uid, 'voice', project, { chars: text.length })
  return { ok: true, value: project }
}

// ── news item's own video («Videoyu düzenle») ──────────────────────────────

/** Open (or create) the edit project for a news item's own video; always built on the original file. */
export async function editProjectForNewsVideo(uid: string, newsId: unknown, now: number): Promise<StoreResult<EditProject>> {
  if (typeof newsId !== 'string') return fail(400, 'invalid_news', 'Haber kimliği geçersiz')
  const n = await newsMedia(newsId)
  if (!n.ok) return n
  if (!n.value.video) return fail(409, 'no_video_file', 'Haberde düzenlenebilir video dosyası yok (YouTube / oynatıcı bağlantıları düzenlenemez)')
  const existing = await col().where('linkedNewsId', '==', newsId).limit(10).get()
  const found = existing.docs.map((x) => withDefaults(x.data() as EditProject)).find((x) => x.newsVideo && x.assets.some((a) => a.kind === 'video' && a.url === n.value.video))
  if (found) return { ok: true, value: found }
  const dur = await probeDurationMs(n.value.video)
  const video: EditAsset = { id: newItemId(), kind: 'video', source: 'news', url: n.value.video, name: `${n.value.title.slice(0, 60)} — video`, durationMs: dur, posterUrl: n.value.poster, addedAt: now }
  const images: EditAsset[] = n.value.images.map((u, i) => ({ id: newItemId(), kind: 'image', source: 'news', url: u, name: `${n.value.title.slice(0, 60)} — görsel ${i + 1}`, durationMs: null, posterUrl: u, addedAt: now }))
  const clip = { ...defaultClip(video), fit: 'contain' as const }
  const p = blank(uid, now, { title: n.value.title || 'Haber videosu', aspect: 'original', assets: [video, ...images], clips: [clip], closing: false, linkedNewsId: newsId, newsVideo: true })
  await col().doc(p.id).set(p)
  await audit(uid, 'create_news_video', p)
  return { ok: true, value: p }
}

/** Show the rendered video on the news page (original fields kept and restorable), or restore. */
export async function applyEditToNews(uid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<{ project: EditProject; slug: string | null }>> {
  const p = await getEditProject(id)
  if (!p) return fail(404, 'not_found', 'Proje bulunamadı')
  if (!p.newsVideo || !p.linkedNewsId) return fail(409, 'not_news_video', 'Bu proje bir haberin videosundan açılmadı')
  const restore = raw.action === 'restore'
  if (!restore && (p.render.status !== 'ready' || !p.render.outputUrl || p.render.key !== renderKeyFor(p))) return fail(409, 'not_rendered', 'Önce videoyu dışa aktarın (güncel hâli)')
  const target = restore ? null : p.render.outputUrl!
  const newsRef = getAdminFirestore().collection(Collections.NEWS).doc(p.linkedNewsId)
  const out = await getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(newsRef)
    if (!s.exists) return null
    const d = s.data() as Record<string, unknown>
    const backup = (d.videoOriginal && typeof d.videoOriginal === 'object' ? d.videoOriginal : null) as Record<string, unknown> | null
    const orig = backup ?? { videoUrl: d.videoUrl ?? null, playbackUrl: d.playbackUrl ?? null, mediaItems: d.mediaItems ?? null }
    let patch: Record<string, unknown>
    if (restore) {
      patch = backup ? { videoUrl: backup.videoUrl ?? '', playbackUrl: backup.playbackUrl ?? null, mediaItems: backup.mediaItems ?? [], videoOriginal: null, videoOriginalUrl: null, videoEdit: null, updatedAt: now } : {}
    } else {
      const items = Array.isArray(orig.mediaItems) ? (orig.mediaItems as Array<Record<string, unknown>>) : []
      let done = false
      const nextItems = items.map((m) => {
        if (!done && m && String(m.type ?? '').toLowerCase() === 'video') {
          done = true
          return { ...m, url: target }
        }
        return m
      })
      patch = {
        videoUrl: target,
        ...(orig.playbackUrl ? { playbackUrl: target } : {}),
        ...(items.length ? { mediaItems: nextItems } : {}),
        videoOriginal: orig,
        videoOriginalUrl: (orig.playbackUrl as string | null) || (orig.videoUrl as string | null) || null,
        videoEdit: { editProjectId: p.id, at: now, by: uid },
        updatedAt: now,
      }
    }
    if (Object.keys(patch).length) tx.update(newsRef, patch)
    tx.update(col().doc(p.id), { newsApplied: restore ? null : { url: target, at: now, by: uid }, updatedAt: now })
    return { slug: typeof d.slug === 'string' ? d.slug : null }
  })
  if (!out) return fail(404, 'news_not_found', 'Haber bulunamadı')
  await writeSocialAudit({ actorId: uid, action: restore ? 'media.news.restore' : 'media.news.apply', entityType: 'news', entityId: p.linkedNewsId, meta: { editProjectId: p.id } })
  const fresh = await getEditProject(p.id)
  return { ok: true, value: { project: fresh ?? p, slug: out.slug } }
}
