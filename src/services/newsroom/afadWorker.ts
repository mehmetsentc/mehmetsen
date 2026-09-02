/**
 * AFAD Deprem Worker — fetches recent earthquakes every 1 minute,
 * publishes M4.0+ as breaking SYSTEM_ALERT news to the `news` collection.
 *
 * P18.1: AFAD is classified as SYSTEM_ALERT (deterministic public-safety source),
 * NOT HUMAN_EDITOR. Publication only through authorizeAfadSystemAlertPublication
 * with the internal trusted path token — arbitrary callers cannot obtain SYSTEM_ALERT.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  AFAD_SYSTEM_ALERT_PATH_TOKEN,
  authorizeAfadSystemAlertPublication,
  publicationProvenanceFields,
} from '@/services/editorial/publicationAuthority'

const AFAD_API = 'https://deprem.afad.gov.tr/apiv2/event/filter'
const MIN_MAGNITUDE = 4.0
const LOOKBACK_MINUTES = 5

interface AfadEvent {
  eventID: string
  location: string
  latitude: string
  longitude: string
  depth: string
  md: string | null
  ml: string
  mw: string | null
  date: string          // "2024-05-01 14:32:00"
  isEventUpdate: boolean
  lastUpdateDate: string | null
  eventType: string
  depthType: string
}

interface AfadResponse {
  eventCount: number
  result: AfadEvent[]
}

function parseMagnitude(ev: AfadEvent): number {
  return parseFloat(ev.mw ?? ev.ml ?? ev.md ?? '0') || 0
}

function buildTitle(ev: AfadEvent, mag: number): string {
  return `AFAD: ${ev.location} - ${mag.toFixed(1)} Büyüklüğünde Deprem`
}

function buildContent(ev: AfadEvent, mag: number): string {
  const depth = parseFloat(ev.depth).toFixed(1)
  const lat = parseFloat(ev.latitude).toFixed(3)
  const lng = parseFloat(ev.longitude).toFixed(3)
  return (
    `AFAD verilerine göre ${ev.location} bölgesinde ${ev.date} tarihinde ` +
    `${mag.toFixed(1)} büyüklüğünde deprem meydana geldi. ` +
    `Depremin odak derinliği ${depth} km olarak ölçüldü. ` +
    `Koordinatlar: ${lat}°K, ${lng}°D. ` +
    `Can kaybı veya hasar bilgisi henüz gelmedi.`
  )
}

export async function runAfadWorker(): Promise<{
  checked: number
  published: number
  skipped: number
  errors: string[]
}> {
  const result = { checked: 0, published: 0, skipped: 0, errors: [] as string[] }

  try {
    const now = new Date()
    const from = new Date(now.getTime() - LOOKBACK_MINUTES * 60 * 1000)
    const fmt = (d: Date) =>
      d.toISOString().replace('T', ' ').slice(0, 19)

    const params = new URLSearchParams({
      start: fmt(from),
      end: fmt(now),
      minmag: String(MIN_MAGNITUDE),
      maxResults: '20',
      orderby: 'timedesc',
    })

    const res = await fetch(`${AFAD_API}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })

    if (!res.ok) {
      result.errors.push(`AFAD API ${res.status}`)
      return result
    }

    const data: AfadResponse = await res.json()
    result.checked = data.result?.length ?? 0

    const db = getAdminFirestore()

    for (const ev of data.result ?? []) {
      const mag = parseMagnitude(ev)
      if (mag < MIN_MAGNITUDE) { result.skipped++; continue }

      const fingerprint = `afad:${ev.eventID}`

      // Skip if already published
      const existing = await db
        .collection(Collections.NEWS)
        .where('rssFingerprint', '==', fingerprint)
        .limit(1)
        .get()
      if (!existing.empty) { result.skipped++; continue }

      // P18.1 — SYSTEM_ALERT only via trusted AFAD path (not HUMAN_EDITOR)
      const authz = authorizeAfadSystemAlertPublication({
        sourceIdentity: 'AFAD',
        ingestionSourceId: 'afad',
        aiGenerated: false,
        trustedPathToken: AFAD_SYSTEM_ALERT_PATH_TOKEN,
      })

      const title = buildTitle(ev, mag)
      const content = buildContent(ev, mag)
      const now2 = Date.now()
      const priorityScore = mag >= 6 ? 95 : mag >= 5 ? 80 : 65

      await db.collection(Collections.NEWS).add({
        title,
        summary: content.slice(0, 200),
        description: content,
        content,
        author: 'nahaber',
        authorId: 'nahaber',
        thumbnail: '',
        coverImageUrl: '',
        videoUrl: '',
        category: 'son-dakika',
        categoryId: 'son-dakika',
        city: ev.location?.split('/')[0]?.trim() ?? '',
        district: '',
        citySlug: '',
        country: 'Türkiye',
        location: null,
        tags: ['deprem', 'afad', 'son-dakika', `deprem-${ev.location?.toLocaleLowerCase('tr-TR').replace(/\s+/g, '-')}`],
        type: 'news',
        source: 'AFAD',
        sourceUrl: 'https://deprem.afad.gov.tr/last-earthquakes.html',
        slug: `afad-deprem-${ev.eventID}-${now2}`,
        status: 'published',
        visibility: 'public',
        postType: 'news',
        isBreaking: true,
        priorityScore,
        breakingScore: priorityScore,
        isPinned: mag >= 5.5,
        isTrending: false,
        aiGenerated: false,
        rssFingerprint: fingerprint,
        rssGuid: ev.eventID,
        ingestionSourceId: 'afad',
        editorId: 'afad-deprem',
        editorType: 'breaking',
        confidenceScore: 95,
        factCheckFlags: [],
        moderationReasons: [],
        viewsCount: 0,
        likesCount: 0,
        commentsCount: 0,
        savesCount: 0,
        sharesCount: 0,
        isEditorPick: false,
        createdAt: now2,
        updatedAt: now2,
        sourcePublishedAt: new Date(ev.date).getTime() || now2,
        ...publicationProvenanceFields(authz),
      })

      result.published++
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
  }

  return result
}
