import 'server-only'

/**
 * ETKİNLİK VİDEO STÜDYOSU — Etkinlik Masası'ndan seçilen etkinliklerden tek video projesi kurar.
 * Proje Liste Stüdyosu altyapısını kullanır (listType 'etkinlik', studio 'etkinlik'):
 * parça parça render, birleştirme, seslendirme ve paylaşım aynı yoldan gider.
 * Hesap video kurulmadan önce seçilir: hesap adı filigran ve kapanış kartına yazılır.
 * NaHaber logosu / adı videoya eklenmez.
 */
import type { DeskItem, DeskMedia } from '@/lib/events/eventDesk'
import { trDateParts } from '@/lib/events/eventDesk'
import { findDeskItem, loadDesk } from '@/lib/events/eventDeskStore'
import { LIST_LIMITS, WM_POSITIONS, defaultList, eventAnnounce, isOneOf, newListItem, defaultIntroAnnounce, type ListItem, type ListMedia, type ListProject, type WmPos } from './listModel'
import { listAudit, newListId, probeMedia, putNewList } from './listStore'

export const EVENT_VIDEO_MAX = LIST_LIMITS.items
const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n)

function dateLabel(it: DeskItem, now: number): { date: string; time: string; day: string; mon: string } {
  const p = trDateParts(it.desk.startsAtOverride ?? it.startsAt, now)
  if (it.daily && it.daily.days > 1) {
    const a = trDateParts(it.daily.from, now)
    const b = trDateParts(it.daily.to, now)
    const short = (d: string) => d.split(' ').slice(0, 2).join(' ')
    return { ...p, date: `${short(a.date)} – ${short(b.date)}, her gün` }
  }
  return p
}

/** Masa medyası: önce video (kütüphane / yükleme / bağlantı), sonra görsel. Hakkı bilinmeyen kullanılmaz. */
async function mediaFor(it: DeskItem): Promise<ListMedia | null> {
  const usable = (m: DeskMedia) => m.rights !== 'unknown'
  const videos = it.desk.media.filter((m) => m.kind === 'video' && usable(m))
  for (const v of videos.slice(0, 2)) {
    let url = v.url
    if (!url && v.libraryId) {
      const { libraryVideoForReel } = await import('@/lib/reels/libraryVideo')
      const r = await libraryVideoForReel(v.libraryId)
      url = 'error' in r ? null : r.url
    }
    if (!url) continue
    const p = await probeMedia(url)
    if (!p || p.durationMs < LIST_LIMITS.clipMinMs) continue
    return { kind: 'video', url, name: v.title ?? 'Etkinlik videosu', durationMs: p.durationMs, inMs: 0, outMs: Math.min(p.durationMs, 20_000), hasAudio: p.hasAudio, ...(p.width && p.height ? { width: p.width, height: p.height } : {}) }
  }
  const img = it.desk.coverUrl ?? it.desk.media.find((m) => m.kind === 'image' && usable(m) && m.url)?.url ?? it.coverUrl
  return img ? { kind: 'image', url: img, name: 'Etkinlik görseli', durationMs: null, inMs: 0, outMs: LIST_LIMITS.imageMs } : null
}

export async function eventItem(it: DeskItem, now: number): Promise<ListItem> {
  const d = dateLabel(it, now)
  const venue = clip(it.desk.info.venue ?? it.venue ?? '', 90)
  const media = await mediaFor(it)
  const own = media?.kind === 'video' && media.hasAudio === true
  const base: ListItem = {
    ...newListItem(clip(it.title, LIST_LIMITS.itemTitle), clip(venue, LIST_LIMITS.itemSub)),
    media,
    price: clip(it.desk.info.price ?? '', 30),
    event: { eventId: it.id, date: d.date, day: d.day, mon: d.mon, time: it.daily ? '' : d.time, venue, city: it.city, category: it.categoryLabel, source: clip(it.sources[0] ?? '', 40), price: clip(it.desk.info.price ?? '', 30) },
    ownFirst: own,
    narrStartMs: own ? Math.min(8_000, Math.max(0, (media?.outMs ?? 0) - 6_000)) : 600,
    duck: 'kisik',
  }
  return { ...base, announce: eventAnnounce(base) }
}

export type EventAccount = { id: string; displayName: string; username: string | null }

export async function createEventList(
  uid: string,
  raw: Record<string, unknown>,
  account: EventAccount,
  now: number,
): Promise<{ ok: true; value: ListProject } | { ok: false; status: number; code: string; error: string }> {
  const ids = Array.isArray(raw.eventIds) ? [...new Set(raw.eventIds.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 200))] : []
  if (!ids.length) return { ok: false, status: 400, code: 'no_events', error: 'En az bir etkinlik seçin' }
  if (ids.length > EVENT_VIDEO_MAX) return { ok: false, status: 400, code: 'too_many', error: `En fazla ${EVENT_VIDEO_MAX} etkinlik` }
  const { items } = await loadDesk(now)
  const found = ids.map((id) => findDeskItem(items, id)).filter((x): x is DeskItem => !!x)
  if (!found.length) return { ok: false, status: 404, code: 'not_found', error: 'Seçilen etkinlikler bulunamadı (geçmiş ya da gizlenmiş olabilir)' }
  found.sort((a, b) => (a.desk.startsAtOverride ?? a.startsAt).localeCompare(b.desk.startsAtOverride ?? b.startsAt))

  const list = defaultList(newListId(), uid, now, 'etkinlik', found.length)
  // medya kontrolü (ffmpeg probe) sınırlı eşzamanlılık
  const out: ListItem[] = []
  for (let i = 0; i < found.length; i += 4) out.push(...(await Promise.all(found.slice(i, i + 4).map((x) => eventItem(x, now)))))
  list.items = out
  const aspect = raw.aspect === '16:9' || raw.aspect === '1:1' || raw.aspect === '4:5' ? raw.aspect : '9:16'
  list.aspect = aspect as ListProject['aspect']
  const city = found[0]!.city
  const intro = clip(typeof raw.introTitle === 'string' ? raw.introTitle : `${city} Etkinlikleri`, LIST_LIMITS.title)
  list.title = clip(typeof raw.title === 'string' && raw.title.trim() ? raw.title : intro, LIST_LIMITS.title)
  list.introTitle = intro
  list.introSubtitle = clip(typeof raw.introSubtitle === 'string' ? raw.introSubtitle : '', 80)
  list.accountId = account.id
  const handle = (account.username ?? '').replace(/^@/, '')
  list.publisher = { name: clip(account.displayName, 60), handle: clip(handle, 40), slogan: 'Şehrin etkinlikleri için takip et' }
  const pos: WmPos = isOneOf(WM_POSITIONS, raw.wmPos) ? raw.wmPos : 'sag-ust'
  const wmText = clip(typeof raw.wmText === 'string' && raw.wmText.trim() ? raw.wmText : handle ? `@${handle}` : account.displayName, 70)
  list.watermark = raw.watermark === false ? null : { text: wmText, pos, opacity: 0.8 }
  list.introAnnounce = defaultIntroAnnounce(list)
  await putNewList(list)
  await listAudit(uid, 'lists.project.save', list, { what: 'from_events', count: list.items.length, studio: 'etkinlik', accountId: account.id })
  return { ok: true, value: list }
}
