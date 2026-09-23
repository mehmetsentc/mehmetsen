import { eventIdentityKey } from '@/lib/eventDedupe'
import { isMaterialBiletixDestinationChange } from '@/services/eventProviders/ticketUrl'
import type { NaEvent } from '@/types/event'

export type OccurrenceWriteDecision =
  | 'insert'
  | 'update'
  | 'skip'
  | 'hold_cancelled_republish'

function asText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return String(value)
}

function sameInstant(stored: string, incoming: string): boolean {
  if (stored === incoming) return true
  const storedMs = Date.parse(stored)
  const incomingMs = Date.parse(incoming)
  if (Number.isFinite(storedMs) && Number.isFinite(incomingMs)) return storedMs === incomingMs
  return false
}

function identityParts(event: Pick<NaEvent, 'title' | 'startsAt' | 'venue'> | Partial<NaEvent>) {
  return {
    title: asText(event.title),
    startsAt: asText(event.startsAt),
    venue: asText(event.venue),
  }
}

/** Material occurrence write: identity, start instant, venue, city, or Biletix event-code. */
export function isMaterialOccurrenceChange(
  incoming: Pick<NaEvent, 'title' | 'startsAt' | 'venue' | 'citySlug' | 'ticketUrl'>,
  stored: Partial<NaEvent>
): boolean {
  const incomingIdentity = eventIdentityKey(identityParts(incoming))
  const storedIdentity = eventIdentityKey(identityParts(stored))
  if (incomingIdentity !== storedIdentity) return true
  if (!sameInstant(asText(stored.startsAt), asText(incoming.startsAt))) return true
  if (asText(stored.citySlug).trim() !== asText(incoming.citySlug).trim()) return true
  if (isMaterialBiletixDestinationChange(asText(stored.ticketUrl) || null, incoming.ticketUrl ?? null)) {
    return true
  }
  return false
}

export function classifyOccurrenceWrite(
  incoming: Pick<NaEvent, 'id' | 'title' | 'startsAt' | 'venue' | 'citySlug' | 'ticketUrl' | 'status'>,
  stored: Partial<NaEvent> | undefined
): OccurrenceWriteDecision {
  if (!stored) return 'insert'
  if (asText(stored.status) === 'cancelled') return 'hold_cancelled_republish'
  if (isMaterialOccurrenceChange(incoming, stored)) return 'update'
  return 'skip'
}

export function planOccurrenceWrites<
  T extends Pick<NaEvent, 'id' | 'title' | 'startsAt' | 'venue' | 'citySlug' | 'ticketUrl' | 'status'>,
>(
  events: T[],
  existingById: Map<string, Partial<NaEvent>>
): {
  wouldInsert: T[]
  wouldUpdate: T[]
  wouldSkipUnchanged: T[]
  wouldHoldCancelledRepublish: T[]
  wouldDelete: 0
} {
  const wouldInsert: T[] = []
  const wouldUpdate: T[] = []
  const wouldSkipUnchanged: T[] = []
  const wouldHoldCancelledRepublish: T[] = []
  for (const event of events) {
    const decision = classifyOccurrenceWrite(event, existingById.get(event.id))
    if (decision === 'insert') wouldInsert.push(event)
    else if (decision === 'update') wouldUpdate.push(event)
    else if (decision === 'hold_cancelled_republish') {
      wouldHoldCancelledRepublish.push(event)
      wouldSkipUnchanged.push(event)
    } else {
      wouldSkipUnchanged.push(event)
    }
  }
  return {
    wouldInsert,
    wouldUpdate,
    wouldSkipUnchanged,
    wouldHoldCancelledRepublish,
    wouldDelete: 0,
  }
}
