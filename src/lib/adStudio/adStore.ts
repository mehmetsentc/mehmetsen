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
  splitScript,
  textWindowEnd,
  voiceHash,
  voiceIsCurrent,
  fitKey,
  fitTarget,
  withAdDefaults,
  type AdMedia,
  type AdProject,
} from './adModel'
import { alignScenes, analyzeVoice, type VoiceTiming } from './adAlign'

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

async function probeMedia(url: string): Promise<{ durationMs: number; hasAudio: boolean } | null> {
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
        resolve(m ? { durationMs: Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000), hasAudio: /Stream #\d+:\d+[^\n]*: Audio:/.test(err) } : null)
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
    const probed = await probeMedia(url)
    if (probed === null) return fail(422, 'video_unreadable', 'Video okunamadı (bozuk ya da desteklenmeyen biçim)')
    const { durationMs, hasAudio } = probed
    m = { id: newItemId(), kind: 'video', url, name, durationMs, inMs: 0, outMs: Math.min(durationMs, AD_LIMITS.totalMs), hasAudio }
  } else {
    m = { id: newItemId(), kind: 'image', url, name, durationMs: null, inMs: 0, outMs: AD_LIMITS.imageMs }
  }
  return patchAdRaw(
    uid,
    id,
    (cur) => {
      if (cur.media.length >= AD_LIMITS.media) return null
      const next = { ...cur, media: [...cur.media, m], updatedAt: now }
      // videonun kendi müziği var: bizim müziğimiz eklenmez, video sesi kapalıysa açılır
      if (m.hasAudio) return { ...next, music: 'yok' as const, videoSound: cur.videoSound === 'kapali' ? ('kisik' as const) : cur.videoSound }
      return next
    },
    'media',
  )
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
  if (voiceIsCurrent(ad)) return { ok: true, value: ad }
  const name = `ads/${id}/voice-${hash}.wav`
  const bucket = getAdminStorage().bucket(BUCKET)
  const file = bucket.file(name)
  let durationMs: number
  let wavBuf: Buffer
  const [exists] = await file.exists().catch(() => [false] as [boolean])
  let usd = 0
  if (exists) {
    const [buf] = await file.download()
    wavBuf = buf
    const { wavSeconds } = await import('@/lib/reels/audio')
    durationMs = Math.round(wavSeconds(buf) * 1000)
  } else {
    const { synthesizeAdVoice, AdVoiceError } = await import('./adVoice')
    try {
      const v = await synthesizeAdVoice(ad.script, ad.voiceId, ad.tone, ad.speed, AbortSignal.timeout(120_000))
      usd = v.usd
      wavBuf = v.wav
      durationMs = Math.round(v.seconds * 1000)
      await file.save(v.wav, { resumable: false, metadata: { contentType: 'audio/wav', cacheControl: 'public, max-age=86400' } })
      await file.makePublic()
    } catch (err) {
      if (err instanceof AdVoiceError) return fail(err.status, 'voice_failed', err.message)
      throw err
    }
  }
  const rawUrl = `https://storage.googleapis.com/${BUCKET}/${name}`
  const rawDurationMs = durationMs
  // VİDEOYA UYDUR: hız (%90–112) + cümle aralarına duraklama; ücretsiz, ham ses saklı kalır
  let url = rawUrl
  let tempo = 1
  let addedPauseMs = 0
  const fk = fitKey(ad)
  const target = fitTarget(ad)
  if (target) {
    const { fitVoiceToVideo } = await import('./adFitServer')
    const fitted = await fitVoiceToVideo(wavBuf, target.endMs - target.startMs)
    const fname = `ads/${id}/voice-${hash}-${fk}.wav`
    await bucket.file(fname).save(fitted.wav, { resumable: false, metadata: { contentType: 'audio/wav', cacheControl: 'public, max-age=86400' } })
    await bucket.file(fname).makePublic()
    url = `https://storage.googleapis.com/${BUCKET}/${fname}`
    wavBuf = fitted.wav
    durationMs = fitted.durationMs
    tempo = fitted.tempo
    addedPauseMs = fitted.addedPauseMs
  }
  const timing = await voiceTiming(wavBuf)
  const r = await patchAdRaw(
    uid,
    id,
    (cur) => {
      if (voiceHash(cur) !== hash || fitKey(cur) !== fk) return null
      const voice = { url, durationMs, hash, voice: cur.voiceId, tone: cur.tone, speed: cur.speed, chars: cur.script.length, createdAt: now, fitKey: fk, rawUrl, rawDurationMs, tempo: Math.round(tempo * 1000) / 1000, addedPauseMs, ...(timing ? { timing } : {}) }
      // yazılar sesle birlikte otomatik eşlenir (kullanıcının düzenlediği yazı metinleri korunur)
      const next = { ...cur, voice, updatedAt: now }
      return timing ? { ...next, scenes: alignFor(next, timing) } : next
    },
    'voice',
  )
  if (!r.ok) return fail(409, 'changed', 'Metin ya da video seslendirme sırasında değişti; tekrar deneyin')
  await audit(uid, 'ads.voice', r.value, { voice: ad.voiceId, tone: ad.tone, seconds: Math.round(durationMs / 100) / 10, usd: Math.round(usd * 10000) / 10000, reused: exists, fit: fk, tempo })
  return r
}

async function voiceTiming(wav: Buffer): Promise<VoiceTiming | null> {
  try {
    const { readWav } = await import('@/lib/reels/audio')
    const pcm = readWav(wav)
    return analyzeVoice(pcm.data, pcm.sampleRate)
  } catch {
    return null
  }
}

/** sahneler (yoksa metinden) seslendirmeye göre zamanlanır */
function alignFor(ad: AdProject, t: VoiceTiming) {
  const texts = ad.scenes.length ? ad.scenes : splitScript(ad.script).map((text) => ({ text }))
  return alignScenes(texts, t, ad.voiceStartMs, textWindowEnd(ad) || AD_LIMITS.totalMs)
}

/** «Yazıları sesle eşleştir»: var olan seslendirmeyi okuyup sahneleri yeniden zamanlar. */
export async function alignAdScenes(uid: string, id: string, now: number): Promise<StoreResult<AdProject>> {
  const ad = await getAd(id)
  if (!ad) return fail(404, 'not_found', 'Reklam bulunamadı')
  if (!ad.voice || !voiceIsCurrent(ad)) return fail(409, 'no_voice', 'Önce «Ses» adımında seslendirmeyi oluşturun / videoya uydurun')
  let timing = ad.voice.timing ?? null
  if (!timing) {
    const name = decodeURIComponent(new URL(ad.voice.url).pathname).replace(`/${BUCKET}/`, '')
    const [buf] = await getAdminStorage().bucket(BUCKET).file(name).download()
    timing = await voiceTiming(buf)
    if (!timing) return fail(422, 'voice_unreadable', 'Seslendirme dosyası okunamadı')
  }
  const t = timing
  return patchAdRaw(uid, id, (cur) => (cur.voice ? { ...cur, voice: { ...cur.voice, timing: t }, scenes: alignFor(cur, t), updatedAt: now } : null), 'align')
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
