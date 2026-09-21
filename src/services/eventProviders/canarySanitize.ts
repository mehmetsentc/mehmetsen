import { getDistrictsForProvince, isTurkishProvinceSlug } from '@/constants/cities'
import type { NaEvent } from '@/types/event'
import { isEventSpecificTicketUrl, parseBiletixPerformanceUrl } from './ticketUrl'

function classifyAuditTicket(url: string | null | undefined) {
  const value = url?.trim()
  if (!value) return 'MISSING' as const
  if (parseBiletixPerformanceUrl(value)) return 'PERFORMANCE_SPECIFIC' as const
  if (isEventSpecificTicketUrl(value)) return 'EVENT_SPECIFIC' as const
  return 'GENERIC_INVALID' as const
}

const ALLOWED_SOURCES = new Set(['biletix', 'bubilet', 'biletimgo'])

export function clampDistrictToProvince(event: NaEvent, provinceSlug: string): NaEvent {
  const allowed = new Set(getDistrictsForProvince(provinceSlug).map((d) => d.slug))
  const next = { ...event }
  if (!next.districtSlug) return next
  if (!allowed.has(next.districtSlug)) {
    delete next.districtSlug
  }
  return next
}

export function canaryWriteRejectReason(
  event: NaEvent,
  provinceSlug: string
): 'invalid_province' | 'invalid_start' | 'invalid_ticket' | 'wrong_source' | null {
  if (!ALLOWED_SOURCES.has(event.source ?? '')) return 'wrong_source'
  if (event.citySlug !== provinceSlug || !isTurkishProvinceSlug(event.citySlug)) {
    return 'invalid_province'
  }
  if (!event.startsAt || Number.isNaN(new Date(event.startsAt).getTime())) {
    return 'invalid_start'
  }
  const ticket = classifyAuditTicket(event.ticketUrl)
  if (ticket === 'GENERIC_INVALID' || ticket === 'MISSING') return 'invalid_ticket'
  return null
}

export function prepareCanaryOccurrences(events: NaEvent[], provinceSlug: string): {
  writeable: NaEvent[]
  skippedInvalid: Array<{ event: NaEvent; reason: string }>
} {
  const writeable: NaEvent[] = []
  const skippedInvalid: Array<{ event: NaEvent; reason: string }> = []
  for (const raw of events) {
    const event = clampDistrictToProvince(raw, provinceSlug)
    const reason = canaryWriteRejectReason(event, provinceSlug)
    if (reason) skippedInvalid.push({ event, reason })
    else writeable.push(event)
  }
  return { writeable, skippedInvalid }
}
