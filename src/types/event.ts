export type EventCategory =
  | 'concert'
  | 'festival'
  | 'party'
  | 'exhibition'
  | 'theater'
  | 'cinema'
  | 'other'

export type EventStatus = 'published' | 'draft' | 'cancelled'

/** Whether an event is upcoming or already past (set by daily sync). */
export type EventTimelineStatus = 'upcoming' | 'past'

export interface NaEvent {
  id: string
  title: string
  description: string
  category: EventCategory
  /** Display name of the city, e.g. "İstanbul". */
  city: string
  /** Normalized slug used for filtering, e.g. "istanbul". */
  citySlug: string
  venue: string
  address?: string
  /** ISO 8601 start datetime (UTC). Used for ordering (upcoming first). */
  startsAt: string
  /** Optional ISO 8601 end datetime (UTC). */
  endsAt?: string
  coverImageUrl?: string
  ticketUrl?: string
  organizer?: string
  createdAt: string
  status: EventStatus
  /**
   * Upcoming vs past — maintained by the daily sync job. When absent on legacy
   * docs, clients fall back to comparing `startsAt` with the current time.
   */
  timelineStatus?: EventTimelineStatus
  /**
   * Where this event originated. `firestore` for events stored in our own
   * collection; otherwise the id of the external ticket provider it was
   * aggregated from (e.g. "biletix"). Optional so existing/seed data stays
   * valid.
   */
  source?: EventSource
  /** Provider's own event id, when available (used for stable upserts). */
  externalId?: string
  /**
   * Provider-native id for dedupe (`externalId` when present, else `sourceHash`).
   * Written by sync so ops can trace a record back to the ticket platform.
   */
  sourceId?: string
  /** Stable hash segment of the doc id (`${source}_${sourceHash}`). */
  sourceHash?: string
  /** Content hash — sync skips Firestore writes when this matches the stored doc. */
  fingerprint?: string
  /** ISO timestamp of the last successful sync write for this record. */
  syncedAt?: string
  /** Human-readable provider/platform name shown as a badge, e.g. "Biletix". */
  provider?: string
  /** Optional venue latitude (when a provider exposes coordinates). */
  lat?: number
  /** Optional venue longitude (when a provider exposes coordinates). */
  lng?: number
  /** İlçe slug for city event filters (e.g. "merkez", "bozcaada"). */
  districtSlug?: string
  /** Human-readable date when exact times vary (recurring / approximate). */
  dateLabel?: string
  /** When set to `annual`, month/day in startsAt/endsAt roll to current or next year. */
  recurrence?: 'annual'
  /** Free-form tags shown on city cards (e.g. "Ücretsiz", "festival"). */
  tags?: string[]
  /** Explicit free/public flags for municipal events. */
  isFree?: boolean
  isPublic?: boolean
  /** Community average rating (1–5), maintained by eventReviews sync. */
  averageRating?: number
  /** Number of user ratings. */
  ratingCount?: number
  /** Number of user comments/reviews with text. */
  reviewCount?: number
}

export interface EventReview {
  id: string
  eventId: string
  userId: string
  userDisplayName: string
  rating: number
  comment: string
  createdAt: string
  updatedAt: string
}

/**
 * `firestore` = our own `events` collection. Any other value is an external
 * ticket-platform adapter id (biletix, biletino, bubilet, …).
 */
export type EventSource = 'firestore' | (string & {})
