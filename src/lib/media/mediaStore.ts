import 'server-only'

/**
 * MEDIA-1 — media project storage (Firestore `mediaProjects`, Admin SDK only).
 * Reads only when the studio opens a project or the list; no scanning.
 */
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { videoLibraryItems } from '@/db/schema/videoLibrary'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getMediaUrl } from '@/lib/storage'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import {
  CAPTION_MAX,
  clipAfterEdit,
  clipRenderKey,
  isProjectId,
  MAX_CLIPS,
  MEDIA_PROJECTS,
  parseClipInput,
  parseRights,
  sourceLabelFor,
  TITLE_MAX,
  type MediaClip,
  type MediaProject,
} from './mediaProject'

const col = () => getAdminFirestore().collection(MEDIA_PROJECTS)
const USABLE_STATUS = new Set(['READY', 'PROCESSING', 'PLAYBACK_READY'])
const USABLE_RIGHTS = new Set(['OWNED', 'LICENSED', 'PARTNER', 'PERMISSION_GRANTED'])
const NEWS_ID_RE = /^[A-Za-z0-9_-]{4,128}$/

export type StoreResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string; field?: string }
const fail = <T,>(status: number, code: string, message: string, field?: string): StoreResult<T> => ({ ok: false, status, code, message, ...(field ? { field } : {}) })

function clean(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '').trim().slice(0, max) : ''
}

/** The library file a project is built on (must be finished and rights-cleared in the library). */
export async function libraryVideoMeta(id: string): Promise<StoreResult<{ title: string; durationMs: number | null; posterUrl: string | null; url: string | null }>> {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) return fail(400, 'invalid_video', 'Video seçilmedi')
  if (!hasDatabaseUrl()) return fail(409, 'library_unavailable', 'Video kütüphanesi bu ortamda yok')
  const [row] = await getDb().select().from(videoLibraryItems).where(eq(videoLibraryItems.id, id)).limit(1)
  if (!row) return fail(404, 'video_not_found', 'Video bulunamadı')
  if (!USABLE_STATUS.has(row.status)) return fail(409, 'video_not_ready', 'Video henüz hazır değil')
  if (!USABLE_RIGHTS.has(row.rightsStatus)) return fail(409, 'video_rights', 'Videonun kütüphanedeki hak durumu onaylı değil')
  const poster = row.posterStorageKey ? getMediaUrl(row.posterStorageKey) : row.thumbnailUrl
  const url = getMediaUrl(row.playbackStorageKey || row.originalStorageKey) || null
  if (!url) return fail(409, 'video_missing', 'Videonun dosyası yok')
  return { ok: true, value: { title: row.title, durationMs: row.durationMs ?? null, posterUrl: poster || null, url } }
}

async function linkedNewsOk(id: unknown): Promise<StoreResult<string | null>> {
  if (id === null || id === undefined || id === '') return { ok: true, value: null }
  if (typeof id !== 'string' || !NEWS_ID_RE.test(id)) return fail(400, 'invalid_news', 'Haber kimliği geçersiz', 'linkedNewsId')
  const s = await getAdminFirestore().collection(Collections.NEWS).doc(id).get()
  if (!s.exists) return fail(404, 'news_not_found', 'Bağlanan haber bulunamadı', 'linkedNewsId')
  return { ok: true, value: id }
}

export function newClipId(): string {
  return randomBytes(5).toString('hex')
}

export async function createProject(actorUid: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<MediaProject>> {
  const rights = parseRights(raw.rights)
  if (!rights.ok) return fail(400, 'invalid_rights', rights.message, rights.field)
  const meta = await libraryVideoMeta(String(raw.videoItemId ?? ''))
  if (!meta.ok) return meta
  const linked = await linkedNewsOk(raw.linkedNewsId)
  if (!linked.ok) return linked
  const id = `mp${randomBytes(8).toString('hex')}`
  const title = clean(raw.title, TITLE_MAX) || meta.value.title.slice(0, TITLE_MAX)
  const dur = meta.value.durationMs
  // First clip: the opening 30 s (or the whole video when shorter), ready to adjust.
  const firstEnd = dur ? Math.min(dur, 30_000) : 30_000
  const first = parseClipInput({ id: newClipId(), name: 'Bölüm 1', startMs: 0, endMs: firstEnd, title }, dur)
  const clips: MediaClip[] = first.ok ? [clipAfterEdit(first.value, undefined, String(raw.videoItemId), sourceLabelFor(rights.value))] : []
  const p: MediaProject = {
    id,
    title,
    caption: clean(raw.caption, CAPTION_MAX),
    videoItemId: String(raw.videoItemId),
    videoTitle: meta.value.title,
    sourceUrl: meta.value.url,
    durationMs: dur,
    posterUrl: meta.value.posterUrl,
    rights: rights.value,
    linkedNewsId: linked.value,
    clips,
    createdBy: actorUid,
    createdAt: now,
    updatedAt: now,
  }
  await col().doc(id).set(p)
  await audit(actorUid, 'create', p)
  return { ok: true, value: p }
}

export async function getProject(id: string): Promise<MediaProject | null> {
  if (!isProjectId(id)) return null
  const s = await col().doc(id).get()
  return s.exists ? (s.data() as MediaProject) : null
}

export async function listProjects(limit = 40): Promise<MediaProject[]> {
  const snap = await col().orderBy('updatedAt', 'desc').limit(limit).get()
  return snap.docs.map((d) => d.data() as MediaProject)
}

/** Save title / caption / rights / linked news / the clip list. Render results are server-owned. */
export async function updateProject(actorUid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<MediaProject>> {
  const p = await getProject(id)
  if (!p) return fail(404, 'not_found', 'Proje bulunamadı')
  let rights = p.rights
  if (raw.rights !== undefined) {
    const r = parseRights(raw.rights)
    if (!r.ok) return fail(400, 'invalid_rights', r.message, r.field)
    rights = r.value
  }
  let linkedNewsId = p.linkedNewsId
  if (raw.linkedNewsId !== undefined) {
    const l = await linkedNewsOk(raw.linkedNewsId)
    if (!l.ok) return l
    linkedNewsId = l.value
  }
  const label = sourceLabelFor(rights)
  let clips = p.clips
  if (raw.clips !== undefined) {
    if (!Array.isArray(raw.clips)) return fail(400, 'invalid_clips', 'Bölüm listesi geçersiz', 'clips')
    if (raw.clips.length > MAX_CLIPS) return fail(400, 'too_many_clips', `En fazla ${MAX_CLIPS} bölüm`, 'clips')
    const prev = new Map(p.clips.map((c) => [c.id, c]))
    const next: MediaClip[] = []
    const seen = new Set<string>()
    for (const c of raw.clips) {
      const parsed = parseClipInput(c, p.durationMs, prev.get((c as { id?: string })?.id ?? ''))
      if (!parsed.ok) return fail(400, 'invalid_clip', parsed.message, parsed.field)
      // every video ends with the nahaber.com card — except a news item's own video shown on nahaber.com
      if (p.sourceKind !== 'news') delete parsed.value.options.outro
      if (seen.has(parsed.value.id)) return fail(400, 'duplicate_clip', 'Aynı bölüm iki kez', 'clips')
      seen.add(parsed.value.id)
      next.push(clipAfterEdit(parsed.value, prev.get(parsed.value.id), p.videoItemId, label))
    }
    clips = next
  } else if (label !== sourceLabelFor(p.rights)) {
    // The source label is part of the picture: re-check every clip against it.
    clips = p.clips.map((c) => clipAfterEdit(c, c, p.videoItemId, label))
  }
  const updated: MediaProject = {
    ...p,
    title: raw.title !== undefined ? clean(raw.title, TITLE_MAX) || p.title : p.title,
    caption: raw.caption !== undefined ? clean(raw.caption, CAPTION_MAX) : p.caption,
    rights,
    linkedNewsId,
    clips,
    updatedAt: now,
  }
  await col().doc(id).set(updated)
  await audit(actorUid, 'update', updated)
  return { ok: true, value: updated }
}

export async function deleteProject(actorUid: string, id: string): Promise<boolean> {
  const p = await getProject(id)
  if (!p) return false
  await col().doc(id).delete()
  // Rendered files and publish records stay (the ledger is history).
  await audit(actorUid, 'delete', p)
  return true
}

/**
 * Store a render result — only when the clip still has the same content as when
 * the render started (an edit in between makes the result stale and it is dropped).
 */
export async function setClipRendered(id: string, clipId: string, renderKey: string, r: { outputUrl: string; coverUrl: string | null; seconds: number } | { error: string }, now: number): Promise<boolean> {
  const ref = col().doc(id)
  return getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return false
    const p = s.data() as MediaProject
    const i = p.clips.findIndex((c) => c.id === clipId)
    if (i < 0) return false
    const c = p.clips[i]!
    if (clipRenderKey(p.videoItemId, c, sourceLabelFor(p.rights)) !== renderKey) return false
    const next: MediaClip =
      'error' in r
        ? { ...c, status: 'failed', renderKey: null, outputUrl: null, coverUrl: null, seconds: null, error: r.error.slice(0, 300), renderedAt: now }
        : { ...c, status: 'ready', renderKey, outputUrl: r.outputUrl, coverUrl: r.coverUrl, seconds: r.seconds, error: null, renderedAt: now }
    const clips = [...p.clips]
    clips[i] = next
    tx.set(ref, { ...p, clips, updatedAt: now })
    return true
  })
}

async function audit(actorUid: string, what: 'create' | 'update' | 'delete', p: MediaProject) {
  await writeSocialAudit({
    actorId: actorUid,
    action: 'media.project.save',
    entityType: 'mediaProject',
    entityId: p.id,
    // No caption or rights note text: kind, source name and counts only.
    meta: { what, videoItemId: p.videoItemId, rightsKind: p.rights.kind, sourceName: p.rights.sourceName, clips: p.clips.length, linkedNewsId: p.linkedNewsId },
  })
}


// ── HABER-VIDEO: a news item's own uploaded video ──────────────────────────────

const NEWS_CLIP_MAX_MS = 180_000

/** Duration of a remote video from the ffmpeg banner (no download); null when it cannot be read. */
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
      p.on('error', () => {
        clearTimeout(timer)
        resolve(null)
      })
    })
  } catch {
    return null
  }
}

/**
 * Open (or create) the cutting project for a news item's own video. The project is always
 * built on the ORIGINAL file (kept in `videoOriginalUrl` once an edit was applied), so
 * reopening never edits an already edited version.
 */
export async function projectForNewsVideo(actorUid: string, newsId: unknown, now: number): Promise<StoreResult<MediaProject>> {
  if (typeof newsId !== 'string' || !NEWS_ID_RE.test(newsId)) return fail(400, 'invalid_news', 'Haber kimliği geçersiz')
  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
  if (!snap.exists) return fail(404, 'news_not_found', 'Haber bulunamadı — yeni haberse önce kaydedin')
  const d = snap.data() as Record<string, unknown>
  const { resolveNewsVideo } = await import('@/lib/social/newsVideo')
  const v = resolveNewsVideo(d)
  const stored = typeof d.videoOriginalUrl === 'string' && d.videoOriginalUrl ? d.videoOriginalUrl : null
  if (!stored && v.kind !== 'file') {
    return fail(409, 'no_video_file', v.kind === 'youtube' || v.kind === 'embed' ? 'Bu haberin videosu bir bağlantı (YouTube / oynatıcı); dosyası bizde olmadığı için düzenlenemez' : 'Haberde kayıtlı video yok — videoyu yükleyip haberi kaydedin')
  }
  const original = stored ?? (v.kind === 'file' ? v.url : '')
  const existing = await col().where('linkedNewsId', '==', newsId).limit(10).get()
  const found = existing.docs.map((x) => x.data() as MediaProject).find((p) => p.sourceKind === 'news' && p.sourceFileUrl === original)
  if (found) return { ok: true, value: found }

  const dur = await probeDurationMs(original)
  const title = (typeof d.title === 'string' ? d.title : 'Haber videosu').trim().slice(0, TITLE_MAX) || 'Haber videosu'
  const id = `mp${randomBytes(8).toString('hex')}`
  const rights = { kind: 'owned' as const, sourceName: null, note: null }
  const end = dur ? Math.min(dur, NEWS_CLIP_MAX_MS) : 30_000
  // haber sayfası için: orijinal biçim, kapanış kartı yok (ayarlardan açılabilir)
  const first = parseClipInput({ id: newClipId(), name: 'Haber videosu', startMs: 0, endMs: end, title, options: { frame: 'original', outro: false } }, dur)
  const videoItemId = `news_${newsId}`.slice(0, 64)
  const poster = [d.thumbnail, d.coverImageUrl, d.imageUrl].find((x): x is string => typeof x === 'string' && /^https:\/\//.test(x)) ?? null
  const p: MediaProject = {
    id,
    title,
    caption: '',
    videoItemId,
    videoTitle: title,
    sourceUrl: original,
    durationMs: dur,
    posterUrl: poster,
    rights,
    linkedNewsId: newsId,
    sourceKind: 'news',
    sourceFileUrl: original,
    newsApplied: null,
    clips: first.ok ? [clipAfterEdit(first.value, undefined, videoItemId, null)] : [],
    createdBy: actorUid,
    createdAt: now,
    updatedAt: now,
  }
  await col().doc(id).set(p)
  await audit(actorUid, 'create', p)
  return { ok: true, value: p }
}

/** Replace the news page video with a rendered clip (the original is kept), or put the original back. */
export async function applyToNews(actorUid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<{ project: MediaProject; newsVideoUrl: string; slug: string | null }>> {
  const p = await getProject(id)
  if (!p) return fail(404, 'not_found', 'Proje bulunamadı')
  if (p.sourceKind !== 'news' || !p.linkedNewsId || !p.sourceFileUrl) return fail(409, 'not_news_video', 'Bu proje bir haberin videosundan açılmadı')
  const restore = raw.action === 'restore'
  const clip = restore ? null : p.clips.find((c) => c.id === raw.clipId)
  if (!restore && (!clip || clip.status !== 'ready' || !clip.outputUrl)) return fail(409, 'clip_not_ready', 'Önce bu parçayı üretin')
  const newsRef = getAdminFirestore().collection(Collections.NEWS).doc(p.linkedNewsId)
  const original = p.sourceFileUrl
  const target = restore ? original : clip!.outputUrl!
  const out = await getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(newsRef)
    if (!s.exists) return null
    const d = s.data() as Record<string, unknown>
    // first edit: keep the page's video fields exactly as they were (restored as-is)
    const backup = (d.videoOriginal && typeof d.videoOriginal === 'object' ? d.videoOriginal : null) as Record<string, unknown> | null
    const orig = backup ?? { videoUrl: d.videoUrl ?? null, playbackUrl: d.playbackUrl ?? null, mediaItems: d.mediaItems ?? null }
    let patch: Record<string, unknown>
    if (restore) {
      if (!backup) {
        tx.update(col().doc(p.id), { newsApplied: null, updatedAt: now })
        return { slug: typeof d.slug === 'string' ? d.slug : null, noop: true }
      }
      patch = { videoUrl: backup.videoUrl ?? '', playbackUrl: backup.playbackUrl ?? null, mediaItems: backup.mediaItems ?? [], videoOriginal: null, videoOriginalUrl: null, videoEdit: null, updatedAt: now }
    } else {
      const origItems = Array.isArray(orig.mediaItems) ? (orig.mediaItems as Array<Record<string, unknown>>) : []
      let replaced = false
      const items = origItems.map((m) => {
        if (!replaced && m && String(m.type ?? '').toLowerCase() === 'video') {
          replaced = true
          return { ...m, url: target }
        }
        return m
      })
      patch = {
        videoUrl: target,
        ...(orig.playbackUrl ? { playbackUrl: target } : {}),
        ...(origItems.length ? { mediaItems: items } : {}),
        videoOriginal: orig,
        videoOriginalUrl: original,
        videoEdit: { projectId: p.id, clipId: clip!.id, at: now, by: actorUid },
        updatedAt: now,
      }
    }
    tx.update(newsRef, patch)
    tx.update(col().doc(p.id), { newsApplied: restore ? null : { clipId: clip!.id, url: target, at: now, by: actorUid }, updatedAt: now })
    return { slug: typeof d.slug === 'string' ? d.slug : null, noop: false }
  })
  if (!out) return fail(404, 'news_not_found', 'Haber bulunamadı')
  await writeSocialAudit({
    actorId: actorUid,
    action: restore ? 'media.news.restore' : 'media.news.apply',
    entityType: 'news',
    entityId: p.linkedNewsId,
    meta: { projectId: p.id, clipId: clip?.id ?? null },
  })
  const fresh = await getProject(p.id)
  return { ok: true, value: { project: fresh ?? p, newsVideoUrl: target, slug: out.slug } }
}
