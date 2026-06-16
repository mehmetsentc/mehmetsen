import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { PostType } from '@/types/post'

const ISTANBUL_TZ = 'Europe/Istanbul'

const istanbulClockFormatter = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: ISTANBUL_TZ,
})

const istanbulDayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: ISTANBUL_TZ,
})

function formatShareClock(date: Date): string {
  return istanbulClockFormatter.format(date)
}

function getIstanbulDayKey(date: Date): string {
  return istanbulDayKeyFormatter.format(date)
}

function parseDayKey(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  if (!year || !month || !day) return NaN
  return Date.UTC(year, month - 1, day)
}

function getIstanbulDaysAgo(date: Date): number {
  const todayKey = getIstanbulDayKey(new Date())
  const targetKey = getIstanbulDayKey(date)
  const todayUtc = parseDayKey(todayKey)
  const targetUtc = parseDayKey(targetKey)
  if (Number.isNaN(todayUtc) || Number.isNaN(targetUtc)) return 0
  return Math.floor((todayUtc - targetUtc) / (24 * 60 * 60 * 1000))
}

export function formatTimelineTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const daysAgo = getIstanbulDaysAgo(date)
  const clock = formatShareClock(date)

  if (daysAgo <= 0) {
    return `bugün ${clock}`
  }

  if (daysAgo === 1) {
    return `dün ${clock}`
  }

  return `${daysAgo} gün önce`
}

export function formatTimelineRelative(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  if (getIstanbulDaysAgo(date) === 0) {
    return formatDistanceToNow(date, { addSuffix: true, locale: tr })
  }

  return ''
}

const POST_TYPE_LABELS: Record<PostType, string> = {
  news: 'Haber',
  video: 'Video',
  photo: 'Fotoğraf',
  user_post: 'Gönderi',
}

const POST_TYPE_STYLES: Record<PostType, string> = {
  news: 'bg-red-50 text-red-700 ring-red-100 dark:bg-red-950 dark:text-red-300 dark:ring-red-900',
  video: 'bg-purple-50 text-purple-700 ring-purple-100 dark:bg-purple-950 dark:text-purple-300 dark:ring-purple-900',
  photo: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900',
  user_post: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900',
}

export function getPostTypeLabel(type: PostType): string {
  return POST_TYPE_LABELS[type]
}

export function getPostTypeStyle(type: PostType): string {
  return POST_TYPE_STYLES[type]
}
