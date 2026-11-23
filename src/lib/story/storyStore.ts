import 'server-only'

/**
 * STORY-1 — story project storage (Firestore `storyProjects`, Admin SDK only).
 * Reads only when the studio opens the list or a project; no scanning.
 * Server-owned fields (asset descriptions, AI image files, render result) are
 * written only by the jobs, inside transactions that check the content did not
 * change while the job ran.
 */
import { randomBytes } from 'node:crypto'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { libraryVideoMeta } from '@/lib/media/mediaStore'
import { Collections } from '@/lib/firebase/collections'
import {
  allowsAiImages,
  EMPTY_RENDER,
  MAX_ASSETS,
  STORY_PROJECTS,
  cleanText,
  imageKeyFor,
  isShortId,
  isStoryId,
  parseMeta,
  parseScenes,
  renderKeyFor,
  type RenderState,
  type StoryAsset,
  type StoryProject,
  type StoryScene,
} from './storyProject'

const col = () => getAdminFirestore().collection(STORY_PROJECTS)

export type StoreResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string; field?: string }
const fail = <T,>(status: number, code: string, message: string, field?: string): StoreResult<T> => ({ ok: false, status, code, message, ...(field ? { field } : {}) })

export const shortId = () => randomBytes(5).toString('hex')

/** Uploaded photos live under the editor's own folder (Storage rules: owner only, ≤ 50 MB). */
export function isOwnUploadPath(p: unknown, uid: string, projectId: string): p is string {
  if (typeof p !== 'string' || p.length > 300) return false
  const prefix = `news-images/${uid}/story/${projectId}/`
  return p.startsWith(prefix) && /^[A-Za-z0-9._-]{1,140}$/.test(p.slice(prefix.length))
}

export async function createStory(uid: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<StoryProject>> {
  const m = parseMeta(raw)
  if (!m.ok) return fail(400, 'invalid', m.message, m.field)
  const p: StoryProject = { id: `st${randomBytes(8).toString('hex')}`, ...m.value, assets: [], scenes: [], plannedAt: null, render: { ...EMPTY_RENDER }, createdBy: uid, createdAt: now, updatedAt: now }
  await col().doc(p.id).set(p)
  await audit(uid, 'create', p)
  return { ok: true, value: p }
}

export async function getStory(id: string): Promise<StoryProject | null> {
  if (!isStoryId(id)) return null
  const s = await col().doc(id).get()
  return s.exists ? withDefaults(s.data() as StoryProject) : null
}

/** Projects saved before formats / lengths existed are vertical 1-minute videos. */
const withDefaults = (p: StoryProject): StoryProject => ({ ...p, format: p.format ?? 'vertical', targetMin: p.targetMin ?? 1, voice: p.voice ?? { name: null, rate: null }, music: p.music ?? 'none', sfx: p.sfx ?? false, scenes: p.scenes.map((s) => ({ ...s, need: s.need ?? null, headline: s.headline ?? null, sub: s.sub ?? null })) })

export async function listStories(limit = 30): Promise<StoryProject[]> {
  const snap = await col().orderBy('updatedAt', 'desc').limit(limit).get()
  return snap.docs.map((d) => withDefaults(d.data() as StoryProject))
}

/** Save meta and / or the scene list (client edits). */
export async function updateStory(uid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<StoryProject>> {
  const p = await getStory(id)
  if (!p) return fail(404, 'not_found', 'Proje bulunamadı')
  const m = parseMeta(raw, p)
  if (!m.ok) return fail(400, 'invalid', m.message, m.field)
  let scenes = p.scenes
  if (raw.scenes !== undefined) {
    const s = parseScenes(raw.scenes, p.assets, p.scenes)
    if (!s.ok) return fail(400, 'invalid_scenes', s.message, s.field)
    scenes = s.value
  }
  const next: StoryProject = { ...p, ...m.value, scenes, updatedAt: now }
  await col().doc(id).set(next)
  await audit(uid, 'update', next)
  return { ok: true, value: next }
}

export async function deleteStory(uid: string, id: string): Promise<boolean> {
  const p = await getStory(id)
  if (!p) return false
  await col().doc(id).delete()
  await audit(uid, 'delete', p)
  return true
}

/** Add an uploaded photo (storage path) or a Video Kütüphanesi video. */
export async function addAsset(uid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<{ project: StoryProject; asset: StoryAsset }>> {
  const p = await getStory(id)
  if (!p) return fail(404, 'not_found', 'Proje bulunamadı')
  if (p.assets.length >= MAX_ASSETS) return fail(409, 'too_many', `En fazla ${MAX_ASSETS} görüntü eklenebilir`)
  let asset: StoryAsset
  if (raw.kind === 'image') {
    if (!isOwnUploadPath(raw.storagePath, uid, id)) return fail(400, 'invalid_path', 'Yüklenen dosyanın yeri geçersiz')
    const { getAdminStorage } = await import('@/lib/firebase/admin')
    const file = getAdminStorage().bucket(uploadBucket()).file(raw.storagePath)
    const [meta] = await file.getMetadata().catch(() => [null] as [null])
    if (!meta) return fail(404, 'upload_missing', 'Yüklenen dosya bulunamadı')
    if (!String(meta.contentType ?? '').startsWith('image/')) return fail(400, 'not_image', 'Dosya bir görsel değil')
    if (Number(meta.size ?? 0) > 50 * 1024 * 1024) return fail(400, 'too_big', 'Görsel 50 MB sınırını aşıyor')
    asset = { id: shortId(), kind: 'image', source: 'upload', ref: raw.storagePath, previewUrl: typeof raw.previewUrl === 'string' && raw.previewUrl.startsWith('https://') ? raw.previewUrl.slice(0, 1000) : null, name: cleanText(raw.name, 80) || 'Fotoğraf', durationMs: null, description: null, describeError: null, addedAt: now }
  } else if (raw.kind === 'video') {
    const meta = await libraryVideoMeta(String(raw.videoItemId ?? ''))
    if (!meta.ok) return meta
    asset = { id: shortId(), kind: 'video', source: 'library', ref: String(raw.videoItemId), previewUrl: meta.value.posterUrl, name: meta.value.title.slice(0, 80), durationMs: meta.value.durationMs, description: null, describeError: null, addedAt: now }
  } else return fail(400, 'invalid_kind', 'Görüntü türü geçersiz')
  const ref = col().doc(id)
  const project = await getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    const cur = s.data() as StoryProject
    const next = { ...cur, assets: [...cur.assets, asset], updatedAt: now }
    tx.set(ref, next)
    return next
  })
  await audit(uid, 'asset', project)
  return { ok: true, value: { project, asset } }
}

/** Remove an asset; scenes that used it fall back to an AI illustration (1 min) or a text card. */
export async function removeAsset(uid: string, id: string, assetId: unknown, now: number): Promise<StoreResult<StoryProject>> {
  if (!isShortId(assetId)) return fail(400, 'invalid_asset', 'Görüntü kimliği geçersiz')
  const ref = col().doc(id)
  const out = await getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return null
    const cur = s.data() as StoryProject
    const scenes: StoryScene[] = cur.scenes.map((sc) =>
      sc.visual.kind !== 'asset' || sc.visual.assetId !== assetId
        ? sc
        : allowsAiImages(cur)
          ? { ...sc, keepAudio: false, visual: { kind: 'ai', prompt: sc.text, imagePath: null, imageUrl: null, imageKey: null, error: null } }
          : { ...sc, keepAudio: false, visual: { kind: 'card' }, need: sc.need || 'Bu cümleyi anlatan bir fotoğraf ya da kısa video ekleyin' },
    )
    const next = { ...cur, assets: cur.assets.filter((a) => a.id !== assetId), scenes, updatedAt: now }
    tx.set(ref, next)
    return next
  })
  if (!out) return fail(404, 'not_found', 'Proje bulunamadı')
  await audit(uid, 'asset', out)
  return { ok: true, value: out }
}

export async function setAssetDescription(id: string, assetId: string, r: { description: string } | { error: string }): Promise<void> {
  const ref = col().doc(id)
  await getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return
    const cur = s.data() as StoryProject
    const assets = cur.assets.map((a) => (a.id !== assetId ? a : 'error' in r ? { ...a, describeError: r.error.slice(0, 200) } : { ...a, description: r.description.slice(0, 400), describeError: null }))
    tx.set(ref, { ...cur, assets })
  })
}

export async function setPlan(uid: string, id: string, plan: { title: string | null; caption: string | null; scenes: StoryScene[]; script?: string }, now: number): Promise<StoryProject | null> {
  const ref = col().doc(id)
  const out = await getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return null
    const cur = s.data() as StoryProject
    // the AI-written script is kept so the editor can read / change it and plan again
    const next: StoryProject = { ...cur, scenes: plan.scenes, script: cur.script || plan.script || '', caption: cur.caption || plan.caption || '', title: cur.title || plan.title || cur.title, plannedAt: now, updatedAt: now }
    tx.set(ref, next)
    return next
  })
  if (out) await audit(uid, 'plan', out)
  return out
}

/** Store a generated illustration — only if the scene still asks for the same picture. */
export async function setSceneImage(id: string, sceneId: string, key: string, r: { imagePath: string; imageUrl: string } | { error: string }): Promise<boolean> {
  const ref = col().doc(id)
  return getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return false
    const cur = s.data() as StoryProject
    const i = cur.scenes.findIndex((x) => x.id === sceneId)
    const sc = cur.scenes[i]
    if (!sc || sc.visual.kind !== 'ai' || imageKeyFor(sc.visual.prompt, cur.style, cur.format) !== key) return false
    const visual = 'error' in r ? { ...sc.visual, error: r.error.slice(0, 200) } : { ...sc.visual, imagePath: r.imagePath, imageUrl: r.imageUrl, imageKey: key, error: null }
    const scenes = [...cur.scenes]
    scenes[i] = { ...sc, visual }
    tx.set(ref, { ...cur, scenes })
    return true
  })
}

/** Store a render result — dropped when the project changed while rendering. */
export async function setRender(id: string, key: string, r: Omit<RenderState, 'key' | 'status'> & { status: 'ready' | 'failed' }): Promise<boolean> {
  const ref = col().doc(id)
  return getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return false
    const cur = s.data() as StoryProject
    if (renderKeyFor(cur) !== key) return false
    tx.set(ref, { ...cur, render: { ...r, key } })
    return true
  })
}

/** Bucket the browser uploads to (Firebase client SDK default bucket). */
export function uploadBucket(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || storyBucket()
}

/** Bucket rendered files go to (same as Reels / media renders). */
export function storyBucket(): string {
  return process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
}

async function audit(uid: string, what: string, p: StoryProject) {
  await writeSocialAudit({
    actorId: uid,
    action: 'story.project.save',
    entityType: 'storyProject',
    entityId: p.id,
    meta: { what, style: p.style, rightsKind: p.rights.kind, sourceName: p.rights.sourceName, assets: p.assets.length, scenes: p.scenes.length },
  })
}


/**
 * HABERDEN-VIDEO: a «Metinden Video» project prepared from a published news item —
 * the headline and text become the topic (AI writes the narration in the chosen style),
 * the news item's own photos and video file become the project's media.
 */
export async function createStoryFromNews(uid: string, newsId: unknown, raw: Record<string, unknown>, now: number): Promise<StoreResult<StoryProject>> {
  if (typeof newsId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(newsId)) return fail(400, 'invalid_news', 'Haber kimliği geçersiz')
  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
  if (!snap.exists) return fail(404, 'news_not_found', 'Haber bulunamadı')
  const d = snap.data() as Record<string, unknown>
  const { newsStoryDraft } = await import('./storyFromNews')
  const draft = newsStoryDraft(d)
  if (!draft.title) return fail(400, 'news_empty', 'Haberin başlığı yok')
  const m = parseMeta({
    ...raw,
    title: draft.title,
    topic: draft.topic,
    script: '',
    caption: typeof raw.caption === 'string' && raw.caption.trim() ? raw.caption : draft.caption,
    rights: { kind: 'owned', sourceName: null, note: `NaHaber haberi ${newsId}` },
  })
  if (!m.ok) return fail(400, 'invalid', m.message, m.field)
  const assets: StoryAsset[] = [
    ...draft.photos.map((url, i): StoryAsset => ({ id: shortId(), kind: 'image', source: 'news', ref: url, previewUrl: url, name: i === 0 ? 'Haber görseli' : `Haber görseli ${i + 1}`, durationMs: null, description: null, describeError: null, addedAt: now })),
    ...(draft.video ? [{ id: shortId(), kind: 'video' as const, source: 'news' as const, ref: draft.video, previewUrl: draft.photos[0] ?? null, name: 'Haberin videosu', durationMs: null, description: null, describeError: null, addedAt: now }] : []),
  ].slice(0, MAX_ASSETS)
  const p: StoryProject = { id: `st${randomBytes(8).toString('hex')}`, ...m.value, newsId, assets, scenes: [], plannedAt: null, render: { ...EMPTY_RENDER }, createdBy: uid, createdAt: now, updatedAt: now }
  await col().doc(p.id).set(p)
  await audit(uid, 'create_from_news', p)
  return { ok: true, value: p }
}
