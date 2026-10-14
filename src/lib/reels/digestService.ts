import 'server-only'

/**
 * REELS-4 — «Günün Öne Çıkanları»: 2–7 published stories in one reel.
 * The AI editor writes one sentence per story; one presenter (or the style's
 * presenter per story) reads them; renderDigest builds the video, which is stored
 * at videos/reels/digest_<id>.mp4 with a reelDigests/<id> record for sharing.
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { parsePersonas, personaFor } from './personas'
import { isReelIntro, isReelMusic, isReelOutro, type ReelIntro, type ReelMusic, type ReelOutro } from './reelOptions'
import { loadPresenterPhoto, planReel, reelSourceFromDoc, reelsEnabled, resolveReelMedia } from './reelService'
import { DIGEST_TRANSITIONS, renderDigest, type DigestItem, type DigestTransition } from './renderDigest'
import { synthesizeReelVoiceEx } from './voice'
import { getReelVoiceSettings } from './voiceSettings'

const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
export const DIGEST_COLLECTION = 'reelDigests'
export const DIGEST_TITLES = ['Günün Öne Çıkanları', 'Sabah Bülteni', 'Akşam Bülteni', 'Haftanın Özeti', "Çanakkale'de Bugün"]

export type DigestOptions = {
  newsIds: string[]
  title?: string | null
  intro?: string | null
  transition?: string | null
  outro?: string | null
  music?: string | null
  personaMode?: 'single' | 'perStyle'
  personaId?: string | null
  actorUid: string
}

export type DigestRecord = {
  id: string
  newsIds: string[]
  title: string
  url: string
  caption: string
  seconds: number
  createdAt: number
  by: string
  lines: string[]
}

export function digestCaption(title: string, dateLabel: string, headlines: string[]): string {
  return [`${title} · ${dateLabel}`, headlines.map((h, i) => `${i + 1}. ${h}`).join('\n'), 'Haberlerin tamamı: https://www.nahaber.com', '#haber #NaHaber #gündem'].join('\n\n')
}

export async function buildDigest(o: DigestOptions): Promise<DigestRecord> {
  if (!reelsEnabled()) throw new Error('reels: SOCIAL_REELS_ENABLED=false')
  const ids = [...new Set(o.newsIds)].filter((x) => /^[A-Za-z0-9_-]{4,128}$/.test(x))
  if (ids.length < 2 || ids.length > 7) throw new Error('reels: 2–7 haber seçin')
  const db = getAdminFirestore()
  const snaps = await db.getAll(...ids.map((id) => db.collection(Collections.NEWS).doc(id)))
  const policy = { alwaysUseMedia: (await getReelVoiceSettings()).alwaysUseMedia !== false }
  const sources = snaps.map((s, i) => {
    if (!s.exists) throw new Error(`reels: haber bulunamadı (${ids[i]})`)
    const d = s.data() as Record<string, unknown>
    if (d.status !== 'published') throw new Error(`reels: haber yayında değil (${ids[i]})`)
    return reelSourceFromDoc(d, policy)
  })
  const settings = await getReelVoiceSettings()
  const personas = parsePersonas(settings.personas)
  const title = (o.title?.trim() || 'Günün Öne Çıkanları').slice(0, 40)
  const dateLabel = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' })
  const single = o.personaMode !== 'perStyle'
  const anchor = personaFor(personas, 'haber', o.personaId)

  const items: DigestItem[] = []
  const lines: string[] = []
  const tmps: string[] = []
  try {
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]!
      const plan = await planReel(src, single ? { personaId: anchor.id } : {}, true)
      const p = single ? anchor : plan.persona
      const spoken = await synthesizeReelVoiceEx(plan.voiceText, AbortSignal.timeout(30_000), {
        voice: p.voice,
        rate: p.rate,
        gemini: settings.geminiEnabled && p.useGemini ? { style: p.geminiStyle, voice: p.geminiVoice, budgetUsd: settings.geminiMonthlyUsd ?? 10 } : null,
      })
      const { media, tmp } = await resolveReelMedia(src, `${ids[i]}-d`)
      if (tmp) tmps.push(tmp)
      items.push({ headline: src.headline, category: src.category, style: plan.style, place: src.place, media, voiceWav: spoken.wav })
      lines.push(plan.voiceText)
    }
    const v = (text: string) => synthesizeReelVoiceEx(text, AbortSignal.timeout(20_000), { voice: anchor.voice, rate: anchor.rate }).then((x) => x.wav)
    const introText = `NaHaber'de ${title.toLocaleLowerCase('tr-TR')}.`
    const r = await renderDigest({
      title,
      dateLabel,
      items,
      introVoiceWav: await v(introText),
      outroVoiceWav: await v("Haberlerin tamamı nahaber.com'da."),
      intro: o.intro === 'list' ? 'list' : isReelIntro(o.intro) ? (o.intro as ReelIntro) : 'list',
      transition: DIGEST_TRANSITIONS.includes(o.transition as DigestTransition) ? (o.transition as DigestTransition) : 'fade',
      outro: isReelOutro(o.outro) ? (o.outro as ReelOutro) : 'logo',
      music: isReelMusic(o.music) ? (o.music as ReelMusic) : 'modern',
      presenter: single && anchor.showCard ? { name: anchor.name, title: anchor.title, photo: await loadPresenterPhoto(anchor.photoUrl) } : null,
    })
    const id = createHash('sha1').update(`${ids.join(',')}|${Date.now()}`).digest('hex').slice(0, 20)
    const file = getAdminStorage().bucket(BUCKET).file(`videos/reels/digest_${id}.mp4`)
    await file.save(r.mp4, { resumable: false, metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=86400' } })
    await file.makePublic()
    const rec: DigestRecord = {
      id,
      newsIds: ids,
      title,
      url: `https://storage.googleapis.com/${BUCKET}/videos/reels/digest_${id}.mp4`,
      caption: digestCaption(title, dateLabel, sources.map((s) => s.headline)),
      seconds: r.seconds,
      createdAt: Date.now(),
      by: o.actorUid,
      lines,
    }
    await db.collection(DIGEST_COLLECTION).doc(id).set(rec)
    return rec
  } finally {
    for (const t of tmps) await fs.rm(t, { force: true }).catch(() => {})
  }
}

export async function getDigest(id: string): Promise<DigestRecord | null> {
  if (!/^[a-f0-9]{8,40}$/.test(id)) return null
  const s = await getAdminFirestore().collection(DIGEST_COLLECTION).doc(id).get()
  return s.exists ? (s.data() as DigestRecord) : null
}

export async function listDigests(limit = 10): Promise<DigestRecord[]> {
  const s = await getAdminFirestore().collection(DIGEST_COLLECTION).orderBy('createdAt', 'desc').limit(limit).get()
  return s.docs.map((d) => d.data() as DigestRecord)
}
