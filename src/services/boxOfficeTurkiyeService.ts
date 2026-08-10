import * as cheerio from 'cheerio'
import { fetchText, providerLog, stripHtml } from '@/services/eventProviders/shared'

/**
 * Box Office Türkiye — weekly gişe scraper.
 * Best-effort: returns null on failure so cron does not break other jobs.
 */

export const BOX_OFFICE_BASE = 'https://boxofficeturkiye.com'
export const BOX_OFFICE_SOURCE = 'box-office-turkiye'
export const BOX_OFFICE_ATTRIBUTION = 'Box Office Türkiye'

const NAHABER_UA =
  'Mozilla/5.0 (compatible; NahaberBot/1.0; +https://canakkale.nahaber.com)'

export interface BoxOfficeFilmEntry {
  rank: number
  title: string
  filmPath: string
  filmUrl: string
  distributor?: string
  releaseDate?: string
  screens?: number
  weeksInRelease?: number
  weekRevenue: string
  weekAudience: string
  totalRevenue: string
  totalAudience: string
}

export interface BoxOfficeWeeklyData {
  year: number
  week: number
  weekKey: string
  detailUrl: string
  totalAudience: string
  totalRevenue: string
  filmCount: number
  films: BoxOfficeFilmEntry[]
  scrapedAt: string
}

function cleanCell(text: string): string {
  return stripHtml(text).replace(/\s+/g, ' ').trim()
}

/** ISO week key for Europe/Istanbul, e.g. `2026-31`. */
export function isoWeekKeyForDate(date = new Date()): string {
  const istanbul = new Date(
    date.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' })
  )
  const tmp = new Date(Date.UTC(istanbul.getFullYear(), istanbul.getMonth(), istanbul.getDate()))
  const day = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${tmp.getUTCFullYear()}-${week}`
}

export function parseWeekKey(weekKey: string): { year: number; week: number } | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec(weekKey.trim())
  if (!m) return null
  return { year: Number(m[1]), week: Number(m[2]) }
}

export function weeklyDetailUrl(weekKey: string): string {
  return `${BOX_OFFICE_BASE}/hafta/detay/${weekKey}`
}

/** Extract first `/hafta/detay/YYYY-WW` link from homepage HTML. */
export function extractLatestWeekKeyFromHomepage(html: string): string | null {
  const match = html.match(/\/hafta\/detay\/(\d{4}-\d{1,2})/)
  return match?.[1] ?? null
}

function parseSummaryStat(html: string, label: string): string | null {
  const re = new RegExp(
    `${label}\\s*<div class="color-gray-87"><strong>(?:<span>)?([^<]+)(?:</span>)?</strong>`,
    'i'
  )
  const m = html.match(re)
  return m?.[1]?.trim() ?? null
}

/** Parse `#WeeklyMovieData` table from weekly detail HTML. */
export function parseWeeklyDetailHtml(html: string, weekKey: string): BoxOfficeWeeklyData | null {
  const parsed = parseWeekKey(weekKey)
  if (!parsed) return null

  const $ = cheerio.load(html)
  const table = $('#WeeklyMovieData')
  if (!table.length) return null

  const films: BoxOfficeFilmEntry[] = []
  table.find('tbody tr').each((index, row) => {
    const cells = $(row).find('td')
    if (cells.length < 7) return

    const rankText = cleanCell($(cells[0]).html() ?? '')
    const titleLink = $(cells[1]).find('a.movie-link').first()
    const title = cleanCell(titleLink.text() || $(cells[1]).text())
    if (!title) return

    const href = titleLink.attr('href')?.trim() || ''
    const filmPath = href.startsWith('/') ? href : href ? `/${href}` : ''
    const filmUrl = filmPath ? `${BOX_OFFICE_BASE}${filmPath}` : BOX_OFFICE_BASE

    const distributor = cleanCell($(cells[2]).text()) || undefined
    const releaseDate = cleanCell($(cells[1]).text()).replace(title, '').trim() || undefined
    const screensRaw = cleanCell($(cells[3]).text())
    const weeksRaw = cleanCell($(cells[4]).text())

    const weekRevenue = cleanCell($(cells[5]).text())
    const weekAudience = cleanCell($(cells[6]).text())
    const totalRevenue = cells.length > 7 ? cleanCell($(cells[7]).text()) : weekRevenue
    const totalAudience = cells.length > 8 ? cleanCell($(cells[8]).text()) : weekAudience

    films.push({
      rank: Number(rankText) || index + 1,
      title,
      filmPath,
      filmUrl,
      distributor: distributor || undefined,
      releaseDate: releaseDate || undefined,
      screens: screensRaw ? Number(screensRaw.replace(/\./g, '')) || undefined : undefined,
      weeksInRelease: weeksRaw ? Number(weeksRaw) || undefined : undefined,
      weekRevenue,
      weekAudience,
      totalRevenue,
      totalAudience,
    })
  })

  if (films.length === 0) return null

  const totalAudience =
    parseSummaryStat(html, 'Toplam Seyirci') ?? films[0]?.totalAudience ?? '—'
  const totalRevenue =
    parseSummaryStat(html, 'Toplam Hasılat') ?? films[0]?.totalRevenue ?? '—'
  const filmCountRaw = parseSummaryStat(html, 'Film Sayısı')
  const filmCount = filmCountRaw
    ? Number(filmCountRaw.replace(/\./g, '')) || films.length
    : films.length

  return {
    year: parsed.year,
    week: parsed.week,
    weekKey,
    detailUrl: weeklyDetailUrl(weekKey),
    totalAudience,
    totalRevenue,
    filmCount,
    films: films.slice(0, 15),
    scrapedAt: new Date().toISOString(),
  }
}

async function fetchHtml(url: string): Promise<string> {
  return fetchText(
    url,
    { headers: { 'User-Agent': NAHABER_UA } },
    20_000
  )
}

export async function resolveCurrentWeekKey(): Promise<string> {
  try {
    const homeHtml = await fetchHtml(BOX_OFFICE_BASE)
    const fromHome = extractLatestWeekKeyFromHomepage(homeHtml)
    if (fromHome) return fromHome
  } catch (error) {
    providerLog(
      BOX_OFFICE_SOURCE,
      'homepage week resolve failed',
      error instanceof Error ? error.message : error
    )
  }
  return isoWeekKeyForDate()
}

export async function fetchWeeklyBoxOffice(
  weekKey?: string
): Promise<BoxOfficeWeeklyData | null> {
  const key = weekKey ?? (await resolveCurrentWeekKey())
  const url = weeklyDetailUrl(key)
  providerLog(BOX_OFFICE_SOURCE, `fetching ${url}`)

  try {
    const html = await fetchHtml(url)
    const parsed = parseWeeklyDetailHtml(html, key)
    if (!parsed) {
      providerLog(BOX_OFFICE_SOURCE, `parse failed for ${key}`)
    }
    return parsed
  } catch (error) {
    providerLog(
      BOX_OFFICE_SOURCE,
      'weekly fetch failed',
      error instanceof Error ? error.message : error
    )
    return null
  }
}
