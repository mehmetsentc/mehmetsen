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
