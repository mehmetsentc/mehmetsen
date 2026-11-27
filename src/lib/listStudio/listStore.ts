import 'server-only'

/**
 * LİSTE STÜDYOSU — Firestore `listProjects` (yalnız Admin SDK; tarama yok, liste 50 kayıtla sınırlı).
 * Medya tarayıcıdan kullanıcının kendi Storage klasörüne yüklenir: news-videos|news-images/{uid}/lists/{id}/…
 * Seslendirme: Gemini TTS (ücretli, ortak aylık ses bütçesi); aynı metin + ses ikinci kez üretilmez.
 */
import { randomBytes } from 'node:crypto'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { EMPTY_RENDER, type RenderState } from '@/lib/edit/editProject'
import { probeSize } from '@/lib/adStudio/adModel'
import { importLinkMedia, LinkMediaError } from './linkMedia'
import {
  LIST_ID_RE,
  LIST_LIMITS,
  LIST_PROJECTS,
  LIST_TYPES,
  LIST_TYPE_INFO,
  STUDIOS,
  applyListPatch,
  defaultList,
  newListItem,
  studioOf,
  introVoiceCurrent,
  isOneOf,
  itemVoiceCurrent,
  listRenderKey,
  listVoiceHash,
  segmentKey,
  withListDefaults,
  EXTRAS_MAX,
  cardsKey,
  effectiveRenderKey,
  type CardsState,
  type MusicTrack,
  type ListMedia,
  type ListProject,
  type ListVoice,
  type SegmentId,
  type Studio,
} from './listModel'

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
const col = () => getAdminFirestore().collection(LIST_PROJECTS)
const publicUrl = (name: string) => `https://storage.googleapis.com/${BUCKET}/${name}`
export type StoreResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; error: string }
const fail = (status: number, code: string, error: string): { ok: false; status: number; code: string; error: string } => ({ ok: false, status, code, error })

type ListAction = 'lists.project.save' | 'lists.project.delete' | 'lists.voice' | 'lists.render' | 'lists.share'
export async function listAudit(uid: string, action: ListAction, l: Pick<ListProject, 'id' | 'listType' | 'pack'>, meta: Record<string, unknown> = {}) {
  await writeSocialAudit({ actorId: uid, action, entityType: 'listProject', entityId: l.id, meta: { listType: l.listType, pack: l.pack, ...meta } }).catch(() => undefined)
}

/** Son projeler; stüdyo süzgeci bellekte (ek Firestore dizini gerekmez, en fazla 120 okuma). */
export async function listLists(studio: Studio = 'muzik'): Promise<ListProject[]> {
  const snap = await col().orderBy('updatedAt', 'desc').limit(120).get()
  return snap.docs
    .map((d) => withListDefaults({ ...(d.data() as ListProject), id: d.id }))
    .filter((l) => l.studio === studio)
    .slice(0, 50)
}

export async function getList(id: string): Promise<ListProject | null> {
  if (!LIST_ID_RE.test(id)) return null
  const s = await col().doc(id).get()
  return s.exists ? withListDefaults({ ...(s.data() as ListProject), id: s.id }) : null
}

export async function createList(uid: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<ListProject>> {
  const studio: Studio = isOneOf(STUDIOS, raw.studio) ? raw.studio : 'muzik'
  const type = isOneOf(LIST_TYPES, raw.listType) && studioOf(raw.listType) === studio ? raw.listType : studio === 'teknoloji' ? 'tek-telefon' : 'pop'
  const count = typeof raw.count === 'number' && Number.isFinite(raw.count) ? Math.max(1, Math.min(LIST_LIMITS.items, Math.round(raw.count))) : LIST_TYPE_INFO[type].count
  const id = `ls${randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '').padEnd(12, '0').slice(0, 14)}`
  if (studio === 'etkinlik' && typeof raw.copyOf !== 'string') return fail(400, 'invalid', 'Etkinlik videosu Etkinlik Masası\'ndan etkinlik seçilerek kurulur')
  let list = defaultList(id, uid, now, type, count)
  // «geçen haftanın listesini kopyala»: sıralar, klipler ve görünüm kopyalanır; ses ve render yeniden
  if (typeof raw.copyOf === 'string') {
    const src = await getList(raw.copyOf)
    if (!src) return fail(404, 'not_found', 'Kopyalanacak liste bulunamadı')
    list = { ...src, id, title: `${src.title} (kopya)`, segments: {}, render: { ...EMPTY_RENDER }, createdBy: uid, createdAt: now, updatedAt: now, items: src.items.map((x) => ({ ...x, change: 'none' as const, prevRank: src.items.indexOf(x) + 1 })) }
  } else if (typeof raw.fromNewsId === 'string') {
    if (studio !== 'teknoloji') return fail(400, 'invalid', 'Haberden proje yalnız Teknoloji Stüdyosu\'nda')
    const draft = await newsDraft(raw.fromNewsId)
    if (!draft.ok) return draft
    list = { ...defaultList(id, uid, now, 'tek-haber', Math.max(1, draft.value.items.length)), ...draft.value.patch }
    list.items = draft.value.items
  } else if (typeof raw.title === 'string') {
    const p = applyListPatch(list, { title: raw.title }, now)
    if (p.ok) list = p.value
  }
  await col().doc(id).set(list)
  await listAudit(uid, 'lists.project.save', list, { what: raw.copyOf ? 'copy' : raw.fromNewsId ? 'from_news' : 'create', count: list.items.length, studio })
  return { ok: true, value: list }
}

/** yeni proje kaydı (Etkinlik Stüdyosu kendi taslağını kurar) */
export async function putNewList(l: ListProject): Promise<void> {
  await col().doc(l.id).create(l)
}
export const newListId = () => `ls${randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '').padEnd(12, '0').slice(0, 14)}`

export async function patchList(uid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<ListProject>> {
  if (!LIST_ID_RE.test(id)) return fail(404, 'not_found', 'Liste bulunamadı')
  const ref = col().doc(id)
  try {
    const l = await getAdminFirestore().runTransaction(async (tx) => {
      const s = await tx.get(ref)
      if (!s.exists) throw Object.assign(new Error('Liste bulunamadı'), { code: 'not_found', status: 404 })
      const r = applyListPatch(withListDefaults({ ...(s.data() as ListProject), id }), raw, now)
      if (!r.ok) throw Object.assign(new Error(r.error), { code: 'invalid', status: 400 })
      tx.set(ref, r.value)
      return r.value
    })
    await listAudit(uid, 'lists.project.save', l, { what: 'patch', fields: Object.keys(raw).slice(0, 20) })
    return { ok: true, value: l }
  } catch (err) {
    const e = err as { message?: string; code?: string; status?: number }
    if (e.status) return fail(e.status, e.code ?? 'error', e.message ?? 'Hata')
    throw err
  }
}

export async function deleteList(uid: string, id: string): Promise<StoreResult<{ id: string }>> {
  const l = await getList(id)
  if (!l) return fail(404, 'not_found', 'Liste bulunamadı')
  await col().doc(id).delete()
  await listAudit(uid, 'lists.project.delete', l, { title: l.title.slice(0, 60) })
  return { ok: true, value: { id } }
}

async function patchRaw(id: string, fn: (cur: ListProject) => ListProject | null): Promise<ListProject | null> {
  const ref = col().doc(id)
  return getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return null
    const next = fn(withListDefaults({ ...(s.data() as ListProject), id }))
    if (next) tx.set(ref, next)
    return next
  })
}

/** Yükleme yalnız kendi klasörüne: news-videos|news-images/{uid}/lists/{id}/… */
export function ownListUploadUrl(url: unknown, uid: string, id: string): url is string {
  if (typeof url !== 'string' || url.length > 2000) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || !/(^|\.)firebasestorage\.googleapis\.com$|(^|\.)storage\.googleapis\.com$/.test(u.hostname)) return false
    const p = decodeURIComponent(u.pathname)
    return p.includes(`news-images/${uid}/lists/${id}/`) || p.includes(`news-videos/${uid}/lists/${id}/`)
  } catch {
    return false
  }
}

async function ffmpegBin(): Promise<string | null> {
  const mod = (await import('ffmpeg-static')) as unknown as { default?: string | null } | string
  return process.env.FFMPEG_PATH || (typeof mod === 'string' ? mod : (mod.default ?? null))
}

export async function probeMedia(url: string): Promise<{ durationMs: number; hasAudio: boolean; width?: number; height?: number } | null> {
  try {
    const { spawn } = await import('node:child_process')
    const bin = await ffmpegBin()
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
        resolve(m ? { durationMs: Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000), hasAudio: /Stream #\d+:\d+[^\n]*: Audio:/.test(err), ...probeSize(err) } : null)
      })
      p.on('error', () => (clearTimeout(timer), resolve(null)))
    })
  } catch {
    return null
  }
}

/**
 * Sıraya klip / kapak ekler ya da platform logosunu ayarlar.
 * role: 'clip' (video ya da görsel) · 'cover' (görsel) · 'platformLogo' (görsel)
 */
export async function addListMedia(uid: string, id: string, raw: Record<string, unknown>, now: number): Promise<StoreResult<ListProject>> {
  const l = await getList(id)
  if (!l) return fail(404, 'not_found', 'Liste bulunamadı')
  // bağlantı → kendi klasörümüze kopya · Video Kütüphanesi kaydı → hakları onaylı oynatma dosyası
  let libraryUrl: string | null = null
  if (typeof raw.link === 'string' && raw.link.trim()) {
    try {
      const m = await importLinkMedia(raw.link.trim(), uid, id, { audio: raw.role === 'music' })
      raw = { ...raw, url: m.url, type: m.kind, name: raw.name ?? m.name }
    } catch (err) {
      if (err instanceof LinkMediaError) return fail(422, err.code, err.message)
      return fail(422, 'link_failed', 'Bağlantıdaki dosya alınamadı')
    }
  } else if (typeof raw.libraryId === 'string') {
    const { libraryVideoForReel } = await import('@/lib/reels/libraryVideo')
    const v = await libraryVideoForReel(raw.libraryId)
    if ('error' in v) return fail(422, 'library', v.error)
    libraryUrl = v.url
    raw = { ...raw, type: 'video', name: raw.name ?? v.title, role: 'clip' }
  }
  if (!libraryUrl && !ownListUploadUrl(raw.url, uid, id)) return fail(400, 'invalid_url', 'Yüklenen dosyanın yeri geçersiz')
  const url = libraryUrl ?? (raw.url as string)
  const isImage = !libraryUrl && decodeURIComponent(new URL(url).pathname).includes('news-images/')
  if (raw.role === 'music') {
    // fon müziği: seçilen saniyeden kesilir, AAC'ye çevrilir (en çok 5 dk), kendi klasörüne yazılır
    if (isImage) return fail(400, 'invalid_url', 'Müzik bir ses dosyası olmalı')
    const startMs = Math.max(0, Math.min(30 * 60_000, Math.round(typeof raw.startMs === 'number' && Number.isFinite(raw.startMs) ? raw.startMs : 0)))
    const track = await processMusic(uid, id, url, startMs, typeof raw.name === 'string' ? raw.name : 'Müzik')
    if (!track) return fail(422, 'music_unreadable', 'Müzik dosyası okunamadı (MP3 / M4A / WAV olmalı)')
    const nextM = await patchRaw(id, (cur) => ({ ...cur, musicTrack: track, music: 'on', updatedAt: now }))
    if (!nextM) return fail(409, 'conflict', 'Liste güncellenemedi')
    await listAudit(uid, 'lists.project.save', nextM, { what: 'music', seconds: Math.round(track.durationMs / 1000) })
    return { ok: true, value: nextM }
  }
  const name = typeof raw.name === 'string' ? raw.name.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 80) || 'Dosya' : 'Dosya'
  const role = raw.role === 'cover' || raw.role === 'platformLogo' || raw.role === 'extra' ? raw.role : 'clip'
  if (role === 'platformLogo') {
    if (!isImage) return fail(400, 'invalid_url', 'Logo bir görsel olmalı')
    const next = await patchRaw(id, (cur) => ({ ...cur, platformLogoUrl: url, logoPlacement: cur.logoPlacement === 'yok' ? 'kose' : cur.logoPlacement, updatedAt: now }))
    if (!next) return fail(409, 'conflict', 'Liste güncellenemedi')
    await listAudit(uid, 'lists.project.save', next, { what: 'platformLogo' })
    return { ok: true, value: next }
  }
  const itemId = typeof raw.itemId === 'string' ? raw.itemId : ''
  if (!l.items.some((x) => x.id === itemId)) return fail(404, 'no_item', 'Sıra bulunamadı')
  let media: ListMedia | null = null
  let evVideo = false
  if (role === 'extra' && (l.items.find((x) => x.id === itemId)?.extras ?? []).length >= EXTRAS_MAX) return fail(409, 'too_many', `Bir etkinliğe en fazla ${EXTRAS_MAX} ek medya`)
  if (role === 'clip' || role === 'extra') {
    if (raw.type === 'video') {
      if (isImage) return fail(400, 'invalid_url', 'Video yeri geçersiz')
      const probed = await probeMedia(url)
      if (!probed) return fail(422, 'video_unreadable', 'Video okunamadı (bozuk ya da desteklenmeyen biçim)')
      const { durationMs, hasAudio, width, height } = probed
      if (durationMs < (role === 'extra' ? 2_000 : LIST_LIMITS.clipMinMs)) return fail(422, 'too_short', role === 'extra' ? 'Video 2 saniyeden kısa' : 'Video 5 saniyeden kısa')
      if (role === 'extra') {
        media = { kind: 'video', url, name, durationMs, inMs: 0, outMs: Math.min(durationMs, 8_000), hasAudio, ...(width && height ? { width, height } : {}) }
      } else {
      // varsayılan aralık: 20 sn (başlangıç 0); kullanıcı «Klipler» adımında kısaltır/kaydırır
      const outMs = Math.min(durationMs, 20_000)
      media = { kind: 'video', url, name, durationMs, inMs: 0, outMs, hasAudio, ...(width && height ? { width, height } : {}) }
      evVideo = l.listType === 'etkinlik' && hasAudio
      }
    } else {
      if (!isImage) return fail(400, 'invalid_url', 'Görsel yeri geçersiz')
      media = { kind: 'image', url, name, durationMs: null, inMs: 0, outMs: role === 'extra' ? 3_000 : LIST_LIMITS.imageMs }
    }
  } else if (!isImage) return fail(400, 'invalid_url', 'Kapak bir görsel olmalı')
  const next = await patchRaw(id, (cur) => ({
    ...cur,
    items: cur.items.map((x) => (x.id !== itemId ? x : role === 'extra' && media ? { ...x, extras: [...(x.extras ?? []), media].slice(0, EXTRAS_MAX) } : role === 'clip' ? { ...x, media, ...(evVideo ? { ownFirst: true, narrStartMs: Math.min(8_000, Math.max(0, (media?.outMs ?? 0) - 6_000)) } : {}) } : { ...x, coverUrl: url })),
    updatedAt: now,
  }))
  if (!next) return fail(409, 'conflict', 'Liste güncellenemedi')
  await listAudit(uid, 'lists.project.save', next, { what: role })
  return { ok: true, value: next }
}

// ── seslendirme ──────────────────────────────────────────────────────────────
export class ListVoiceError extends Error {
  constructor(message: string, public readonly status = 422) {
    super(message)
    this.name = 'ListVoiceError'
  }
}

/** Tek bir anons satırı → WAV (Gemini TTS, bütçeli). Ücretsiz sese düşülmez. */
async function synthesizeLine(text: string, l: ListProject, signal?: AbortSignal): Promise<{ wav: Buffer; seconds: number; usd: number }> {
  const [{ wavSeconds }, { toSpokenTurkish }, Q, { getReelVoiceSettings }, { pronunciationPrompt }, { foreignLexicon }, G, { AD_VOICES }, { AD_TTS_MODEL }, { listVoicePrompt }] = await Promise.all([
    import('@/lib/reels/audio'),
    import('@/lib/reels/ttsNormalize'),
    import('@/lib/reels/ttsQuota'),
    import('@/lib/reels/voiceSettings'),
    import('@/lib/reels/pronunciation'),
    import('@/lib/reels/foreignLexicon'),
    import('@/lib/reels/geminiTts'),
    import('@/lib/adStudio/adModel'),
    import('@/lib/adStudio/adVoice'),
    import('./listModel'),
  ])
  const clean = text.replace(/\s+/g, ' ').replace(/…/g, '...').replace(/[«»]/g, '').trim()
  const input = toSpokenTurkish(clean, await foreignLexicon(clean)).slice(0, 600)
  if (input.length < 2) throw new ListVoiceError('Seslendirilecek metin boş', 400)
  const settings = await getReelVoiceSettings()
  const budget = settings.geminiMonthlyUsd ?? 10
  let reservation: { month: string; usd: number } | null = null
  try {
    reservation = await Q.reserveGeminiUsd(Q.estimateGeminiUsd(input), budget)
  } catch (err) {
    if (err instanceof Q.GeminiBudgetError) throw new ListVoiceError(`Aylık profesyonel ses bütçesi doldu (${err.used.toFixed(2)} / ${err.budget.toFixed(2)} $). «İl Ses ve Renk» ekranından bütçe artırılabilir.`, 402)
    throw err
  }
  try {
    const { wav } = await G.synthesizeGeminiTts({ text: input, prompt: listVoicePrompt(l.pack, l.voiceId) + pronunciationPrompt(input), voice: AD_VOICES[l.voiceId].gemini, model: AD_TTS_MODEL, signal })
    const seconds = wavSeconds(wav)
    const usd = (seconds * 25 * 10) / 1e6 + ((input.length / 4 + 60) * 0.5) / 1e6
    await Q.adjustGeminiUsd(reservation, usd)
    return { wav, seconds, usd }
  } catch (err) {
    await Q.adjustGeminiUsd(reservation, 0)
    if (err instanceof G.GeminiTtsUnavailable) throw new ListVoiceError(err.message, 422)
    throw new ListVoiceError(err instanceof Error && err.name === 'TimeoutError' ? 'Ses servisi zaman aşımına uğradı' : 'Profesyonel ses üretilemedi', 422)
  }
}

async function voiceFor(l: ListProject, text: string, now: number): Promise<{ voice: ListVoice; usd: number; reused: boolean }> {
  const hash = listVoiceHash(l.pack, l.voiceId, text)
  const name = `lists/${l.id}/v-${hash}.wav`
  const file = getAdminStorage().bucket(BUCKET).file(name)
  const [exists] = await file.exists().catch(() => [false] as [boolean])
  if (exists) {
    const [buf] = await file.download()
    const { wavSeconds } = await import('@/lib/reels/audio')
    return { voice: { url: publicUrl(name), durationMs: Math.round(wavSeconds(buf) * 1000), hash, createdAt: now }, usd: 0, reused: true }
  }
  const v = await synthesizeLine(text, l, AbortSignal.timeout(60_000))
  await file.save(v.wav, { resumable: false, metadata: { contentType: 'audio/wav', cacheControl: 'public, max-age=86400' } })
  await file.makePublic()
  return { voice: { url: publicUrl(name), durationMs: Math.round(v.seconds * 1000), hash, createdAt: now }, usd: v.usd, reused: false }
}

/**
 * Eksik anonsları seslendirir — her çağrıda en fazla `batch` satır (Cloudflare 100 sn sınırı).
 * Dönen `remaining` > 0 ise istemci tekrar çağırır.
 */
export async function generateListVoices(uid: string, id: string, now: number, batch = 5): Promise<StoreResult<{ list: ListProject; remaining: number; made: number }>> {
  const l = await getList(id)
  if (!l) return fail(404, 'not_found', 'Liste bulunamadı')
  if (!l.voiceOn) return { ok: true, value: { list: l, remaining: 0, made: 0 } }
  const jobs: Array<{ target: 'intro' | string; text: string }> = []
  if (l.introAnnounce.trim() && !introVoiceCurrent(l)) jobs.push({ target: 'intro', text: l.introAnnounce })
  for (const x of l.items) if (x.announce.trim() && !itemVoiceCurrent(l, x)) jobs.push({ target: x.id, text: x.announce })
  const todo = jobs.slice(0, batch)
  const made: Array<{ target: string; voice: ListVoice }> = []
  let usd = 0
  const started = Date.now()
  for (const j of todo) {
    if (Date.now() - started > 70_000) break
    try {
      const r = await voiceFor(l, j.text, now)
      usd += r.usd
      made.push({ target: j.target, voice: r.voice })
    } catch (err) {
      if (made.length) break // yapılanları kaydet, hatayı bir sonraki çağrıda göster
      if (err instanceof ListVoiceError) return fail(err.status, 'voice_failed', err.message)
      throw err
    }
  }
  const next = await patchRaw(id, (cur) => {
    let introVoice = cur.introVoice
    const items = cur.items.map((x) => {
      const m = made.find((v) => v.target === x.id)
      // metin bu arada değiştiyse eski sesi yazma
      return m && listVoiceHash(cur.pack, cur.voiceId, x.announce) === m.voice.hash ? { ...x, voice: m.voice } : x
    })
    const mi = made.find((v) => v.target === 'intro')
    if (mi && listVoiceHash(cur.pack, cur.voiceId, cur.introAnnounce) === mi.voice.hash) introVoice = mi.voice
    return { ...cur, items, introVoice, updatedAt: now }
  })
  if (!next) return fail(409, 'conflict', 'Liste güncellenemedi')
  if (made.length) await listAudit(uid, 'lists.voice', next, { lines: made.length, voice: l.voiceId, usd: Math.round(usd * 10000) / 10000 })
  const remaining = Math.max(0, jobs.length - made.length)
  return { ok: true, value: { list: next, remaining, made: made.length } }
}

/** Paket + ses için kısa dinleme örneği (bir kez üretilir). */
export async function listVoiceSample(l: ListProject): Promise<StoreResult<{ url: string }>> {
  const name = `lists/samples/v1-${l.pack}-${l.voiceId}.wav`
  const file = getAdminStorage().bucket(BUCKET).file(name)
  const [exists] = await file.exists().catch(() => [false] as [boolean])
  if (exists) return { ok: true, value: { url: publicUrl(name) } }
  try {
    const sample = l.pack === 'fragman' ? 'Ve bu haftanın bir numarası… herkes onu konuşuyor.' : l.pack === 'lounge' ? 'Üç numarada, gecenin en güzel şarkısı.' : 'Ve bu haftanın bir numarası… zirvede yeni bir isim var!'
    const v = await synthesizeLine(sample, l, AbortSignal.timeout(60_000))
    await file.save(v.wav, { resumable: false, metadata: { contentType: 'audio/wav', cacheControl: 'public, max-age=604800' } })
    await file.makePublic()
    return { ok: true, value: { url: publicUrl(name) } }
  } catch (err) {
    if (err instanceof ListVoiceError) return fail(err.status, 'voice_failed', err.message)
    throw err
  }
}

// ── parça render + birleştirme ───────────────────────────────────────────────
const SFX_PREFIX = 'lists/sfx/v1-'
/** ses efektlerini Storage'a bir kez yükler; ad → URL */
export async function ensureSfx(names: string[]): Promise<Map<string, string>> {
  const { SFX_FILE } = await import('./listModel')
  const path = await import('node:path')
  const bucket = getAdminStorage().bucket(BUCKET)
  const out = new Map<string, string>()
  for (const n of names) {
    const local = SFX_FILE[n as keyof typeof SFX_FILE]
    if (!local) continue
    const name = `${SFX_PREFIX}${n}.wav`
    const f = bucket.file(name)
    const [exists] = await f.exists().catch(() => [false] as [boolean])
    if (!exists) {
      try {
        await bucket.upload(path.join(process.cwd(), local), { destination: name, metadata: { contentType: 'audio/wav', cacheControl: 'public, max-age=604800' } })
        await f.makePublic()
      } catch (err) {
        console.warn('[list-studio] ses efekti yüklenemedi', n, err instanceof Error ? err.message : err)
        continue
      }
    }
    out.set(n, publicUrl(name))
  }
  return out
}

export async function setSegmentRendered(id: string, seg: SegmentId, key: string, r: { url: string; seconds: number }): Promise<boolean> {
  const ref = col().doc(id)
  return getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return false
    const l = withListDefaults({ ...(s.data() as ListProject), id })
    if (segmentKey(l, seg) !== key) return false
    tx.update(ref, { [`segments.${seg}`]: { key, url: r.url, seconds: r.seconds } })
    return true
  })
}

export async function setListRendered(id: string, key: string, r: { outputUrl: string; coverUrl: string | null; seconds: number } | { error: string }, now: number): Promise<boolean> {
  const ref = col().doc(id)
  return getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return false
    const l = withListDefaults({ ...(s.data() as ListProject), id })
    if (effectiveRenderKey(l) !== key) return false
    const render: RenderState = 'error' in r ? { ...EMPTY_RENDER, status: 'failed', error: r.error.slice(0, 300), renderedAt: now } : { status: 'ready', key, outputUrl: r.outputUrl, coverUrl: r.coverUrl, seconds: r.seconds, error: null, renderedAt: now }
    tx.update(ref, { render })
    return true
  })
}

// ── fon müziği ───────────────────────────────────────────────────────────────
/** Parçayı başlangıç saniyesinden keser, AAC (M4A) yapar ve listenin klasörüne yazar. */
async function processMusic(uid: string, id: string, url: string, startMs: number, rawName: string): Promise<MusicTrack | null> {
  const bin = await ffmpegBin()
  if (!bin) return null
  const fs = (await import('node:fs')).promises
  const os = await import('node:os')
  const path = await import('node:path')
  const { spawn } = await import('node:child_process')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lmusic-'))
  const out = path.join(dir, 'music.m4a')
  try {
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(startMs / 1000), '-i', url, '-t', '300', '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], { stdio: 'ignore' })
      const t = setTimeout(() => p.kill('SIGKILL'), 120_000)
      p.on('close', (c) => (clearTimeout(t), resolve(c === 0)))
      p.on('error', () => (clearTimeout(t), resolve(false)))
    })
    if (!ok) return null
    const buf = await fs.readFile(out)
    if (buf.byteLength < 2_000) return null
    const name = `news-videos/${uid}/lists/${id}/music-${Date.now()}.m4a`
    const file = getAdminStorage().bucket(BUCKET).file(name)
    await file.save(buf, { resumable: false, metadata: { contentType: 'audio/mp4', cacheControl: 'public, max-age=86400' } })
    await file.makePublic().catch(() => undefined)
    const pub = publicUrl(name)
    const probed = await probeMedia(pub)
    const clean = rawName.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 80) || 'Müzik'
    return { url: pub, name: clean, durationMs: probed?.durationMs ?? 0, startMs }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ── kartlar ──────────────────────────────────────────────────────────────────
export async function setCardsRendered(id: string, key: string, r: { urls: string[] } | { error: string }, now: number): Promise<boolean> {
  const ref = col().doc(id)
  return getAdminFirestore().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return false
    const l = withListDefaults({ ...(s.data() as ListProject), id })
    if (cardsKey(l) !== key) return false
    const cards: CardsState = 'error' in r ? { status: 'error', key, urls: [], error: r.error.slice(0, 300), updatedAt: now } : { status: 'ready', key, urls: r.urls, error: null, updatedAt: now }
    tx.update(ref, { cards })
    return true
  })
}
/** Kartları çizer ve `lists/cards/{id}/{key}-{n}.jpg` olarak yükler (aynı anahtar ikinci kez çizilmez). */
export async function renderCardsAndStore(l: ListProject, key: string): Promise<string[]> {
  const bucket = getAdminStorage().bucket(BUCKET)
  const first = bucket.file(`lists/cards/${l.id}/${key}-0.jpg`)
  const { renderEventCards } = await import('./eventCards')
  const [exists] = await first.exists().catch(() => [false] as [boolean])
  if (exists && l.cards.key === key && l.cards.urls.length) return l.cards.urls
  const bufs = await renderEventCards(l)
  const urls: string[] = []
  for (let i = 0; i < bufs.length; i++) {
    const name = `lists/cards/${l.id}/${key}-${i}.jpg`
    const f = bucket.file(name)
    await f.save(bufs[i]!, { resumable: false, metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=604800' } })
    await f.makePublic().catch(() => undefined)
    urls.push(publicUrl(name))
  }
  return urls
}

/** Hazır parçaları yeniden kodlamadan (concat -c copy) tek MP4 yapar ve Storage'a yükler. */
export async function concatSegments(l: ListProject, key: string, segUrls: string[]): Promise<{ outputUrl: string; coverUrl: string | null; seconds: number; reused: boolean }> {
  const fs = (await import('node:fs')).promises
  const os = await import('node:os')
  const path = await import('node:path')
  const { spawn } = await import('node:child_process')
  const bucket = getAdminStorage().bucket(BUCKET)
  const mp4Name = `lists/${l.id}/final-${key}.mp4`
  const jpgName = `lists/${l.id}/final-${key}.jpg`
  const [exists] = await bucket.file(mp4Name).exists().catch(() => [false] as [boolean])
  const run = (bin: string, args: string[], ms: number) =>
    new Promise<string>((resolve, reject) => {
      const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let err = ''
      const t = setTimeout(() => p.kill('SIGKILL'), ms)
      p.stderr!.on('data', (d) => {
        if (err.length < 40_000) err += String(d)
      })
      p.on('close', (code) => (clearTimeout(t), code === 0 ? resolve(err) : reject(new Error(`ffmpeg ${code}: ${err.slice(-400)}`))))
      p.on('error', (e) => (clearTimeout(t), reject(e)))
    })
  const bin = await ffmpegBin()
  if (!bin) throw new Error('ffmpeg bulunamadı')
  if (exists) {
    const [jpg] = await bucket.file(jpgName).exists().catch(() => [false] as [boolean])
    return { outputUrl: publicUrl(mp4Name), coverUrl: jpg ? publicUrl(jpgName) : null, seconds: 0, reused: true }
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'list-'))
  try {
    const files: string[] = []
    for (const [i, u] of segUrls.entries()) {
      const res = await fetch(u, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`Parça ${i + 1} indirilemedi (HTTP ${res.status})`)
      const f = path.join(dir, `s${String(i).padStart(3, '0')}.mp4`)
      await fs.writeFile(f, Buffer.from(await res.arrayBuffer()))
      files.push(f)
    }
    const listFile = path.join(dir, 'list.txt')
    await fs.writeFile(listFile, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'))
    const out = path.join(dir, 'out.mp4')
    // görüntü kopyalanır (parçalar aynı biçimde: H.264 30 fps, aynı tuval); ses tek seferde yeniden kodlanır (dikiş yerlerinde tıkırtı olmasın)
    await run(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', out], 600_000)
    const info = await run(bin, ['-hide_banner', '-i', out], 30_000).catch((e: Error) => e.message)
    const m = String(info).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    const seconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0
    const jpg = path.join(dir, 'cover.jpg')
    // kapak: ilk sıranın kartı (giriş parçasından hemen sonra)
    await run(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '4.2', '-i', out, '-frames:v', '1', '-q:v', '3', jpg], 60_000).catch(() => '')
    await bucket.upload(out, { destination: mp4Name, resumable: (await fs.stat(out)).size > 8 * 1024 * 1024, metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=86400' } })
    await bucket.file(mp4Name).makePublic()
    let coverUrl: string | null = null
    try {
      await bucket.upload(jpg, { destination: jpgName, metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400' } })
      await bucket.file(jpgName).makePublic()
      coverUrl = publicUrl(jpgName)
    } catch {
      coverUrl = null
    }
    return { outputUrl: publicUrl(mp4Name), coverUrl, seconds: Math.round(seconds * 10) / 10, reused: false }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ── TEKNOLOJİ: NaHaber haberinden taslak ─────────────────────────────────────
/** Metni okunur cümlelere böler (kısa / boş parçalar atılır). */
export function newsPoints(text: string, max = 6): string[] {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return []
  return flat
    .split(/(?<=[.!?…])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.replace(/[^\p{L}\p{N}]/gu, '').length >= 25)
    .slice(0, max)
}

/**
 * Haber → teknoloji tanıtım taslağı: başlık giriş kartına, özet + metin cümleleri «başlık» kartlarına
 * (anons metni = cümlenin kendisi; yeni bilgi eklenmez), haberin fotoğrafları / video dosyası kliplere.
 * Medya yalnız haberin kendi hakları uygunsa (reelSourceFromDoc.mediaAllowed) kullanılır; yoksa kullanıcı yükler.
 * NaHaber logosu / bağlantısı eklenmez (bağımsız yayın).
 */
async function newsDraft(newsId: string): Promise<StoreResult<{ patch: Partial<ListProject>; items: ListProject['items'] }>> {
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(newsId)) return fail(400, 'invalid', 'Haber kimliği geçersiz')
  const { Collections } = await import('@/lib/firebase/collections')
  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
  if (!snap.exists) return fail(404, 'not_found', 'Haber bulunamadı')
  const d = snap.data() as Record<string, unknown>
  if (d.status !== 'published') return fail(409, 'not_published', 'Yalnız yayımlanmış haberden video hazırlanır')
  const { reelSourceFromDoc } = await import('@/lib/reels/reelService')
  const src = reelSourceFromDoc(d, { alwaysUseMedia: true })
  const points = newsPoints(`${src.summary ?? ''} ${src.body ?? ''}`)
  if (!points.length) return fail(422, 'no_text', 'Haberde videoya dönüştürülecek metin yok')
  const photos = src.mediaAllowed ? [...new Set([src.imageUrl, ...(src.imageUrls ?? [])].filter((u): u is string => !!u && /^https:\/\//i.test(u)))] : []
  let video: ListMedia | null = null
  if (src.mediaAllowed && src.videoUrl && /^https:\/\//i.test(src.videoUrl) && !/\.m3u8(\?|$)/i.test(src.videoUrl)) {
    const p = await probeMedia(src.videoUrl)
    if (p && p.durationMs >= LIST_LIMITS.clipMinMs) video = { kind: 'video', url: src.videoUrl, name: 'Haber videosu', durationMs: p.durationMs, inMs: 0, outMs: Math.min(p.durationMs, 12_000), hasAudio: p.hasAudio, ...(p.width && p.height ? { width: p.width, height: p.height } : {}) }
  }
  const items = points.map((sentence, i) => {
    const title = sentence.split(/[,:;–—]/)[0]!.split(' ').slice(0, 7).join(' ').replace(/[.!?…]+$/, '').slice(0, 60)
    const media: ListMedia | null = i === 0 && video ? video : photos.length ? { kind: 'image', url: photos[(video ? i - 1 : i) % photos.length]!, name: 'Haber fotoğrafı', durationMs: null, inMs: 0, outMs: 7_000 } : null
    return { ...newListItem(title, sentence.length > 80 ? '' : sentence), announce: sentence.slice(0, LIST_LIMITS.announce), media }
  })
  const title = src.headline.trim().slice(0, 90)
  return { ok: true, value: { items, patch: { title: title.slice(0, LIST_LIMITS.title), introTitle: title, introSubtitle: src.category ? String(src.category).slice(0, 60) : '', introAnnounce: `Teknoloji dünyasında bugün… ${title}.`, countdown: false } } }
}
