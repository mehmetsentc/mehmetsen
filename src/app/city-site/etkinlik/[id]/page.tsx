import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, MapPin, ExternalLink } from 'lucide-react'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  formatEventDisplayDate,
  getEventCategoryLabel,
  getEventCategoryStyle,
  isEventFree,
  resolveEventImageUrl,
} from '@/lib/eventUtils'
import { resolveEventFilterCategory } from '@/lib/cityEventFilters'
import type { NaEvent } from '@/types/event'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

async function fetchEvent(id: string): Promise<NaEvent | null> {
  try {
    const db = getAdminFirestore()
    const doc = await db.collection(Collections.EVENTS).doc(id).get()
    if (!doc.exists) return null
    return { id: doc.id, ...(doc.data() as Omit<NaEvent, 'id'>) }
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const event = await fetchEvent(id)
  if (!event) return {}
  return {
    title: event.title,
    description: event.description?.slice(0, 160),
  }
}

export default async function CityEventDetailPage({ params }: Props) {
  const { id } = await params
  const event = await fetchEvent(id)
  if (!event) notFound()

  const coverImageUrl = resolveEventImageUrl(event.coverImageUrl)
  const dateLabel = formatEventDisplayDate(event)
  const category = resolveEventFilterCategory(event)
  const free = isEventFree(event)

  return (
    <div className="mx-auto max-w-2xl pb-12 pt-4">
      {/* Geri */}
      <Link
        href="/etkinlik"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Etkinlikler
      </Link>

      {/* Kapak görseli */}
      {coverImageUrl && (
        <div className="mb-5 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImageUrl}
            alt={event.title}
            className="w-full object-cover"
            style={{ maxHeight: 420 }}
          />
        </div>
      )}

      {/* Kategori chip */}
      <span className={`pill mb-3 inline-block text-xs font-semibold ${getEventCategoryStyle(category)}`}>
        {getEventCategoryLabel(category)}
      </span>

      {/* Başlık */}
      <h1 className="mb-4 text-xl font-black leading-snug text-[rgb(var(--color-text))] md:text-2xl">
        {event.title}
      </h1>

      {/* Meta */}
      <div className="mb-5 space-y-2">
        {dateLabel && (
          <div className="flex items-center gap-2 text-sm text-[rgb(var(--color-text-secondary))]">
            <CalendarDays className="h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]" />
            <span>{dateLabel}</span>
          </div>
        )}
        {(event.venue || event.city) && (
          <div className="flex items-center gap-2 text-sm text-[rgb(var(--color-text-secondary))]">
            <MapPin className="h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]" />
            <span>{[event.venue, event.address ?? event.city].filter(Boolean).join(' — ')}</span>
          </div>
        )}
        {free && (
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            Halka açık · giriş ücretsiz
          </p>
        )}
      </div>

      {/* Açıklama */}
      {event.description && (
        <div className="mb-6 rounded-xl bg-[rgb(var(--color-surface-raised))] p-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-[rgb(var(--color-text-secondary))]">
            {event.description}
          </p>
        </div>
      )}

      {/* Düzenleyen */}
      {event.organizer && (
        <p className="mb-6 text-xs text-[rgb(var(--color-muted))]">
          Düzenleyen: <span className="font-semibold">{event.organizer}</span>
        </p>
      )}

      {/* Bilet butonu */}
      {event.ticketUrl && (
        <a
          href={event.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          <ExternalLink className="h-4 w-4" />
          Bilet Al
        </a>
      )}
    </div>
  )
}
