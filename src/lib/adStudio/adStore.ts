import 'server-only'

/**
 * REKLAM STÜDYOSU — Firestore `adProjects` (yalnız Admin SDK; tarama yok, liste 50 kayıtla sınırlı).
 */
import { randomBytes } from 'node:crypto'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { newItemId } from '@/lib/edit/editProject'
import { EMPTY_RENDER, type RenderState } from '@/lib/edit/editProject'
import {
  AD_KINDS,
  AD_LIMITS,
  AD_PROJECTS,
  adRenderKey,
  applyAdPatch,
  defaultAd,
  isOneOf,
  voiceHash,
  withAdDefaults,
  type AdMedia,
  type AdProject,
} from './adModel'

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
const col = () => getAdminFirestore().collection(AD_PROJECTS)
export const AD_ID_RE = /^ad[A-Za-z0-9]{10,30}$/
export type StoreResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; error: string }
const fail = (status: number, code: string, error: string): { ok: false; status: number; code: string; error: string } => ({ ok: false, status, code, error })

async function audit(uid: string, action: 'ads.project.save' | 'ads.project.delete' | 'ads.voice' | 'ads.render', ad: Pick<AdProject, 'id' | 'kind' | 'look'>, meta: Record<string, unknown> = {}) {
  await writeSocialAudit({ actorId: uid, action, entityType: 'adProject', entityId: ad.id, meta: { kind: ad.kind, look: ad.look, ...meta } }).catch(() => undefined)
}

export async function listAds(): Promise<AdProject[]> {
  const snap = await col().orderBy('updatedAt', 'desc').limit(50).get()
  return snap.docs.map((d) => withAdDefaults({ ...(d.data() as AdProject), id: d.id }))
}

export async function getAd(id: string): Promise<AdProject | null> {
  if (!AD_ID_RE.test(id)) return null
  const s = await col().doc(id).get()
  return s.exists ? withAdDefaults({ ...(s.data() as AdProject), id: s.id }) : null
}

export async function createAd(uid: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<AdProject>> {
  const kind = isOneOf(AD_KINDS, raw.kind) ? raw.kind : 'firma'
  const id = `ad${randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '').padEnd(12, '0').slice(0, 14)}`
  let ad = defaultAd(id, uid, now, kind)
  const p = applyAdPatch(ad, { title: raw.title ?? 'Yeni reklam', script: raw.script ?? '' }, now)
  if (p.ok) ad = p.value
  await col().doc(id).set(ad)
  await audit(uid, 'ads.project.save', ad, { what: 'create' })
  return { ok: true, value: ad }
}

export async function patchAd(uid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<AdProject>> {
  if (!AD_ID_RE.test(id)) return fail(404, 'not_found', 'Reklam bulunamadı')
  const ref = col().doc(id)
  try {
    const ad = await getAdminFirestore().runTransaction(async (tx) => {
      const s = await tx.get(ref)
      if (!s.exists) throw Object.assign(new Error('Reklam bulunamadı'), { code: 'not_found', status: 404 })
      const cur = withAdDefaults({ ...(s.data() as AdProject), id })
      const r = applyAdPatch(cur, raw, now)
      if (!r.ok) throw Object.assign(new Error(r.error), { code: 'invalid', status: 400 })
      tx.set(ref, r.value)
      return r.value
    })
    await audit(uid, 'ads.project.save', ad, { what: 'patch', fields: Object.keys(raw).slice(0, 20) })
    return { ok: true, value: ad }
  } catch (err) {
    const e = err as { message?: string; code?: string; status?: number }
    if (e.status) return fail(e.status, e.code ?? 'error', e.message ?? 'Hata')
    throw err
  }
}

export async function deleteAd(uid: string, id: string): Promise<StoreResult<{ id: string }>> {
  const ad = await getAd(id)
  if (!ad) return fail(404, 'not_found', 'Reklam bulunamadı')
  await col().doc(id).delete()
  await audit(uid, 'ads.project.delete', ad, { title: ad.title.slice(0, 60) })
  return { ok: true, value: { id } }
}

/** Yükleme yalnız kendi klasörüne: news-videos|news-images/{uid}/ads/{id}/… */
export function ownAdUploadUrl(url: unknown, uid: string, id: string): url is string {
  if (typeof url !== 'string' || url.length > 2000) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || !/(^|\.)firebasestorage\.googleapis\.com$|(^|\.)storage\.googleapis\.com$/.test(u.hostname)) return false
    const p = decodeURIComponent(u.pathname)
    return p.includes(`news-images/${uid}/ads/${id}/`) || p.includes(`news-videos/${uid}/ads/${id}/`)
  } catch {
    return false
  }
}

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

/** Medya ekler (video / görsel) ya da logoyu ayarlar (role: 'logo'). */
export async function addAdMedia(uid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<AdProject>> {
  const ad = await getAd(id)
  if (!ad) return fail(404, 'not_found', 'Reklam bulunamadı')
  if (!ownAdUploadUrl(raw.url, uid, id)) return fail(400, 'invalid_url', 'Yüklenen dosyanın yeri geçersiz')
  const url = raw.url
  const name = typeof raw.name === 'string' ? raw.name.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 80) || 'Dosya' : 'Dosya'
  if (raw.role === 'logo') {
    if (!decodeURIComponent(new URL(url).pathname).includes('news-images/')) return fail(400, 'invalid_url', 'Logo bir görsel olmalı')
    return patchAdRaw(uid, id, (cur) => ({ ...cur, logoUrl: url, updatedAt: now }), 'logo')
  }
  if (ad.media.length >= AD_LIMITS.media) return fail(409, 'too_many', `En fazla ${AD_LIMITS.media} medya`)
  let m: AdMedia
  if (raw.type === 'video') {
    if (!decodeURIComponent(new URL(url).pathname).includes('news-videos/')) return fail(400, 'invalid_url', 'Video yeri geçersiz')
    const durationMs = await probeDurationMs(url)
    if (durationMs === null) return fail(422, 'video_unreadable', 'Video okunamadı (bozuk ya da desteklenmeyen biçim)')
    m = { id: newItemId(), kind: 'video', url, name, durationMs, inMs: 0, outMs: Math.min(durationMs, AD_LIMITS.totalMs) }
  } else {
    m = { id: newItemId(), kind: 'image', url, name, durationMs: null, inMs: 0, outMs: AD_LIMITS.imageMs }
  }
  return patchAdRaw(uid, id, (cur) => (cur.media.length >= AD_LIMITS.media ? null : { ...cur, media: [...cur.media, m], updatedAt: now }), 'media')
}

async function patchAdRaw(uid: string, id: string, fn: (cur: AdProject) => AdProject | null, what: string): Promise<StoreResult<AdProject>> {
  const ref = col().doc(id)
  const ad = await getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return null
    const next = fn(withAdDefaults({ ...(s.data() as AdProject), id }))
    if (next) tx.set(ref, next)
    return next
  })
  if (!ad) return fail(409, 'conflict', 'Reklam güncellenemedi')
  await audit(uid, 'ads.project.save', ad, { what })
  return { ok: true, value: ad }
}

/** Gemini profesyonel seslendirme → Storage (aynı metin+ses+ton+hız tekrar üretilmez). */
export async function generateAdVoice(uid: string, id: string, now: number): Promise<StoreResult<AdProject>> {
  const ad = await getAd(id)
  if (!ad) return fail(404, 'not_found', 'Reklam bulunamadı')
  if (!ad.script.trim()) return fail(400, 'empty_script', 'Önce reklam metnini yazın')
  const hash = voiceHash(ad)
  if (ad.voice && ad.voice.hash === hash) return { ok: true, value: ad }
  const name = `ads/${id}/voice-${hash}.wav`
  const bucket = getAdminStorage().bucket(BUCKET)
  const file = bucket.file(name)
  let durationMs: number
  const [exists] = await file.exists().catch(() => [false] as [boolean])
  let usd = 0
  if (exists) {
    const [buf] = await file.download()
    const { wavSeconds } = await import('@/lib/reels/audio')
    durationMs = Math.round(wavSeconds(buf) * 1000)
  } else {
    const { synthesizeAdVoice, AdVoiceError } = await import('./adVoice')
    try {
      const v = await synthesizeAdVoice(ad.script, ad.voiceId, ad.tone, ad.speed, AbortSignal.timeout(120_000))
      usd = v.usd
      durationMs = Math.round(v.seconds * 1000)
      await file.save(v.wav, { resumable: false, metadata: { contentType: 'audio/wav', cacheControl: 'public, max-age=86400' } })
      await file.makePublic()
    } catch (err) {
      if (err instanceof AdVoiceError) return fail(err.status, 'voice_failed', err.message)
      throw err
    }
  }
  const url = `https://storage.googleapis.com/${BUCKET}/${name}`
  const r = await patchAdRaw(uid, id, (cur) => (voiceHash(cur) !== hash ? null : { ...cur, voice: { url, durationMs, hash, voice: cur.voiceId, tone: cur.tone, speed: cur.speed, chars: cur.script.length, createdAt: now }, updatedAt: now }), 'voice')
  if (!r.ok) return fail(409, 'changed', 'Metin seslendirme sırasında değişti; tekrar deneyin')
  await audit(uid, 'ads.voice', r.value, { voice: ad.voiceId, tone: ad.tone, seconds: Math.round(durationMs / 100) / 10, usd: Math.round(usd * 10000) / 10000, reused: exists })
  return r
}

/** 4 sesin kısa dinleme örneği (bir kez üretilir, Storage'da saklanır). */
export async function voiceSampleUrl(voice: 'kaan' | 'ece' | 'mert' | 'selin', tone: 'etkileyici' | 'sakin' | 'coskulu' | 'samimi'): Promise<StoreResult<{ url: string }>> {
  const name = `ads/samples/v1-${voice}-${tone}.wav`
  const bucket = getAdminStorage().bucket(BUCKET)
  const file = bucket.file(name)
  const url = `https://storage.googleapis.com/${BUCKET}/${name}`
  const [exists] = await file.exists().catch(() => [false] as [boolean])
  if (exists) return { ok: true, value: { url } }
  const { synthesizeAdVoice, AdVoiceError } = await import('./adVoice')
  try {
    const v = await synthesizeAdVoice('Kalite, yalnızca üretilen üründe değil… verilen sözde ve kurulan güvende saklıdır.', voice, tone, 1, AbortSignal.timeout(60_000))
    await file.save(v.wav, { resumable: false, metadata: { contentType: 'audio/wav', cacheControl: 'public, max-age=604800' } })
    await file.makePublic()
    return { ok: true, value: { url } }
  } catch (err) {
    if (err instanceof AdVoiceError) return fail(err.status, 'voice_failed', err.message)
    throw err
  }
}

export async function setAdRendered(id: string, key: string, r: { outputUrl: string; coverUrl: string | null; seconds: number } | { error: string }, now: number): Promise<boolean> {
  const ref = col().doc(id)
  return getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return false
    const ad = withAdDefaults({ ...(s.data() as AdProject), id })
    if (adRenderKey(ad) !== key) return false
    const render: RenderState = 'error' in r ? { ...EMPTY_RENDER, status: 'failed', error: r.error.slice(0, 300), renderedAt: now } : { status: 'ready', key, outputUrl: r.outputUrl, coverUrl: r.coverUrl, seconds: r.seconds, error: null, renderedAt: now }
    tx.update(ref, { render })
    return true
  })
}
