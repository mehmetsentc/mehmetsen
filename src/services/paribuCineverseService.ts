import * as cheerio from 'cheerio'
import { slugifyCity } from '@/lib/location'
import {
  extractJsonLd,
  fetchText,
  providerLog,
  stripHtml,
} from '@/services/eventProviders/shared'

/**
 * Paribu Cineverse 17 Çanakkale Burda — server-side showtime scraper.
 *
 * The cinema page embeds schema.org MovieTheater + Movie ItemList JSON-LD and
 * renders same-day sessions in HTML. Other days are loaded via `?tarih=DD-MM-YYYY`
 * (see DateTimePickerDetail.js on marsgate CDN).
 *
 * Best-effort: one polite fetch per day in the date picker, bounded concurrency,
 * realistic User-Agent. Returns [] on failure so cron does not break other jobs.
 */

const BASE_URL = 'https://www.paribucineverse.com'
export const PARIBU_CINEMA_PATH = '/sinemalar/17-burda'
export const PARIBU_CINEMA_ID = 'c33d07de-c639-41f6-8921-1ea0206ee131'
export const PARIBU_VENUE = 'Paribu Cineverse 17 Çanakkale Burda'
export const PARIBU_ADDRESS = 'Barbaros Mah. Atatürk Cad. No: 207 / Çanakkale'
export const PARIBU_SOURCE = 'paribu-cineverse'
export const PARIBU_PROVIDER_LABEL = 'Paribu Cineverse'

const NAHABER_UA =
  'Mozilla/5.0 (compatible; NahaberBot/1.0; +https://canakkale.nahaber.com)'

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000
const DEFAULT_DAYS_AHEAD = 7
const FETCH_DELAY_MS = 400

export interface ParibuMovieMeta {
  name: string
  genre?: string
  description?: string
  image?: string
  url?: string
}

export interface ParibuSession {
  ticketPath: string
  timeLabel: string
  dataTime: string
  startsAtIso: string
}

export interface ParibuMovieDay {
  movieSlug: string
  title: string
  genre?: string
  description?: string
  coverImageUrl?: string
  movieUrl?: string
  dateIso: string
  dateParam: string
  format?: string
  sessions: ParibuSession[]
}

export interface ParibuScrapeResult {
  movies: ParibuMovieDay[]
  datesFetched: string[]
  cinemaPageUrl: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Turkish-aware slug for stable Firestore doc ids. */
export function slugifyMovieTitle(title: string): string {
  return slugifyCity(title).slice(0, 80) || 'film'
}

/** `10-08-2026` → `2026-08-10` */
export function dateParamToIso(dateParam: string): string | null {
  const m = dateParam.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return null
  const [, day, month, year] = m
  return `${year}-${month}-${day}`
}

/** `2026-08-10` → `10-08-2026` */
export function dateIsoToParam(dateIso: string): string | null {
  const m = dateIso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [, year, month, day] = m
  return `${day}-${month}-${year}`
}

/**
 * Parses session clock time in Europe/Istanbul (fixed UTC+3) into ISO UTC.
 * Accepts `12:45 PM` / `3:00 PM` or 24h `12:45`.
 */
export function parseIstanbulSessionIso(dateIso: string, rawTime: string): string | null {
  const trimmed = rawTime.trim()
  const m = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
  if (!m) return null

  let hours = Number(m[1])
  const minutes = Number(m[2])
  const ampm = m[3]?.toUpperCase()

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours > 23 || minutes > 59) return null

  if (ampm === 'PM' && hours < 12) hours += 12
  if (ampm === 'AM' && hours === 12) hours = 0

  const [year, month, day] = dateIso.split('-').map(Number)
  if (!year || !month || !day) return null

  const utcMs = Date.UTC(year, month - 1, day, hours, minutes) - ISTANBUL_OFFSET_MS
  const d = new Date(utcMs)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function decodeHtmlEntities(value: string): string {
  return cheerio.load(`<span>${value}</span>`)('span').text().trim()
}

function normalizeMovieKey(name: string): string {
  return decodeHtmlEntities(name).toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')
}

function parseMoviesFromJsonLd(html: string): Map<string, ParibuMovieMeta> {
  const out = new Map<string, ParibuMovieMeta>()

  for (const node of extractJsonLd(html)) {
    if (node['@type'] !== 'MovieTheater') continue
    const mainEntity = node.mainEntity as Record<string, unknown> | undefined
    const nested = mainEntity?.mainEntity as Record<string, unknown> | undefined
    const list = nested?.itemListElement
    if (!Array.isArray(list)) continue

    for (const entry of list) {
      const item = (entry as Record<string, unknown>)?.item as Record<string, unknown> | undefined
      if (!item || item['@type'] !== 'Movie') continue
      const name = typeof item.name === 'string' ? decodeHtmlEntities(item.name) : ''
      if (!name) continue
      out.set(normalizeMovieKey(name), {
        name,
        genre: typeof item.genre === 'string' ? item.genre.trim() : undefined,
        description:
          typeof item.description === 'string'
            ? stripHtml(decodeHtmlEntities(item.description))
            : undefined,
        image: typeof item.image === 'string' ? item.image.trim() : undefined,
        url: typeof item.url === 'string' ? item.url.trim() : undefined,
      })
    }
  }

  return out
}

/** Reads date tabs from the cinema page date picker. */
export function parseAvailableDateParams(html: string): string[] {
  const $ = cheerio.load(html)
  const seen = new Set<string>()
  const dates: string[] = []

  $('[data-full-date-reverse]').each((_, el) => {
    const param = $(el).attr('data-full-date-reverse')?.trim()
    if (!param || seen.has(param)) return
    if (!dateParamToIso(param)) return
    seen.add(param)
    dates.push(param)
  })

  return dates
}

function absoluteTicketUrl(ticketPath: string): string {
  if (ticketPath.startsWith('http://') || ticketPath.startsWith('https://')) return ticketPath
  return `${BASE_URL}${ticketPath.startsWith('/') ? '' : '/'}${ticketPath}`
}

function cinemaPageUrl(dateParam?: string): string {
  const base = `${BASE_URL}${PARIBU_CINEMA_PATH}`
  return dateParam ? `${base}?tarih=${encodeURIComponent(dateParam)}` : base
}

/**
 * Parses movie session blocks from a cinema detail HTML page for one calendar day.
 * Dedupes mobile/desktop duplicate rows by movie title and session ticket path.
 */
export function parseMovieSessionsFromHtml(
  html: string,
  dateParam: string,
  metaByTitle: Map<string, ParibuMovieMeta> = parseMoviesFromJsonLd(html)
): ParibuMovieDay[] {
  const dateIso = dateParamToIso(dateParam)
  if (!dateIso) return []

  const $ = cheerio.load(html)
  const positions: Array<{ pos: number; title: string }> = []
  const re = /data-movie-title="([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    positions.push({ pos: match.index, title: decodeHtmlEntities(match[1]) })
  }

  const seenTitles = new Set<string>()
  const movies: ParibuMovieDay[] = []

  for (let i = 0; i < positions.length; i++) {
    const { pos, title } = positions[i]
    const key = normalizeMovieKey(title)
    if (seenTitles.has(key)) continue

    const end = i + 1 < positions.length ? positions[i + 1].pos : pos + 12_000
    const chunk = html.slice(pos, end)
    const $chunk = cheerio.load(chunk)

    const sessions = parseSessionsFromChunk($chunk, dateIso)
    if (!sessions.length) continue

    seenTitles.add(key)
    const meta = metaByTitle.get(key)
    movies.push(buildMovieDay(title, dateIso, dateParam, sessions, meta, $chunk.root()))
  }

  return movies
}

function parseSessionsFromChunk(
  $: cheerio.CheerioAPI,
  dateIso: string
): ParibuSession[] {
  const byTicket = new Map<string, ParibuSession>()

  $('a.cinema-list-item[data-url]').each((_, a) => {
    const ticketPath = $(a).attr('data-url')?.trim()
    const dataTime = $(a).attr('data-time')?.trim() || $(a).attr('title')?.trim() || ''
    const timeLabel = $(a).text().trim() || dataTime
    if (!ticketPath || byTicket.has(ticketPath)) return
    const startsAtIso = parseIstanbulSessionIso(dateIso, dataTime || timeLabel)
    if (!startsAtIso) return
    byTicket.set(ticketPath, { ticketPath, timeLabel, dataTime, startsAtIso })
  })

  return [...byTicket.values()].sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso))
}

function buildMovieDay(
  title: string,
  dateIso: string,
  dateParam: string,
  sessions: ParibuSession[],
  meta: ParibuMovieMeta | undefined,
  scope: cheerio.Cheerio<cheerio.Element>
): ParibuMovieDay {
  const genre =
    scope.find('#movieGenre').first().text().trim() ||
    meta?.genre ||
    undefined
  const format = scope.find('.cinema-detail-tech-text').first().text().trim() || undefined
  const posterFromDom = scope
    .find('img[src*="movie_posters/"], img[data-src*="movie_posters/"]')
    .first()
    .attr('src')
    ?.trim()
  const posterLazy = scope
    .find('img[data-src*="movie_posters/"]')
    .first()
    .attr('data-src')
    ?.trim()

  const coverImageUrl = meta?.image || posterFromDom || posterLazy

  sessions.sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso))

  return {
    movieSlug: slugifyMovieTitle(title),
    title,
    genre,
    description: meta?.description,
    coverImageUrl,
    movieUrl: meta?.url,
    dateIso,
    dateParam,
    format,
    sessions,
  }
}

function filterDatesFromToday(dateParams: string[], nowIso: string): string[] {
  const todayStart = new Date(nowIso)
  todayStart.setUTCHours(0, 0, 0, 0)

  return dateParams.filter((param) => {
    const iso = dateParamToIso(param)
    if (!iso) return false
    const day = new Date(`${iso}T00:00:00.000Z`)
    return day.getTime() >= todayStart.getTime() - ISTANBUL_OFFSET_MS
  })
}

async function fetchCinemaHtml(dateParam?: string): Promise<string> {
  const url = cinemaPageUrl(dateParam)
  providerLog('paribu-cineverse', `fetch ${url}`)
  return fetchText(
    url,
    { headers: { 'User-Agent': NAHABER_UA } },
    15_000
  )
}

/**
 * Scrapes today + near-future showtimes for Paribu Cineverse 17 Çanakkale Burda.
 */
export async function fetchParibuCanakkaleShowtimes(options?: {
  daysAhead?: number
  nowIso?: string
}): Promise<ParibuScrapeResult> {
  const daysAhead = options?.daysAhead ?? DEFAULT_DAYS_AHEAD
  const nowIso = options?.nowIso ?? new Date().toISOString()

  try {
    const firstHtml = await fetchCinemaHtml()
    const metaByTitle = parseMoviesFromJsonLd(firstHtml)
    const allDateParams = parseAvailableDateParams(firstHtml)
    const futureDates = filterDatesFromToday(allDateParams, nowIso).slice(0, daysAhead)

    if (futureDates.length === 0) {
      providerLog('paribu-cineverse', 'no future dates in picker — returning []')
      return { movies: [], datesFetched: [], cinemaPageUrl: cinemaPageUrl() }
    }

    const movies: ParibuMovieDay[] = []
    const datesFetched: string[] = []

    for (const dateParam of futureDates) {
      const html =
        dateParam === futureDates[0] && futureDates[0] === allDateParams[0]
          ? firstHtml
          : await (async () => {
              await sleep(FETCH_DELAY_MS)
              return fetchCinemaHtml(dateParam)
            })()

      const dayMovies = parseMovieSessionsFromHtml(html, dateParam, metaByTitle)
      movies.push(...dayMovies)
      datesFetched.push(dateParam)
    }

    providerLog(
      'paribu-cineverse',
      `parsed ${movies.length} movie-day row(s) across ${datesFetched.length} date(s)`
    )

    return {
      movies,
      datesFetched,
      cinemaPageUrl: cinemaPageUrl(),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    providerLog('paribu-cineverse', `scrape failed: ${message} — returning []`)
    return { movies: [], datesFetched: [], cinemaPageUrl: cinemaPageUrl() }
  }
}

export function buildParibuEventId(movieSlug: string, dateIso: string): string {
  return `paribu-17burda-${movieSlug}-${dateIso}`
}

export function formatSessionTimesLabel(sessions: ParibuSession[]): string {
  return sessions.map((s) => s.timeLabel).join(' · ')
}

export function pickTicketUrl(sessions: ParibuSession[], dateParam: string): string {
  if (sessions.length > 0) return absoluteTicketUrl(sessions[0].ticketPath)
  return cinemaPageUrl(dateParam)
}
