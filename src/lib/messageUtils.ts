import { format, isToday, isYesterday } from 'date-fns'
import { tr } from 'date-fns/locale'

export function formatMessageListTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  if (isToday(date)) return format(date, 'HH:mm', { locale: tr })
  if (isYesterday(date)) return 'Dün'
  return format(date, 'd MMM', { locale: tr })
}

export function formatMessageBubbleTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return format(date, 'HH:mm', { locale: tr })
}

export function truncateMessagePreview(text: string | null, max = 42): string {
  if (!text) return 'Henüz mesaj yok'
  if (text.length <= max) return text
  return `${text.slice(0, max).trim()}…`
}
