import type { NaEvent } from '@/types/event'
import type { EventProvider, EventProviderParams, ProviderDiagnostics, ProviderFetchResult } from './types'
import { readEnv } from './shared'

export const EMPTY_PROVIDER_DIAGNOSTICS: ProviderDiagnostics = {
  status: 'EMPTY',
  discovered: 0,
  containers: 0,
  occurrences: 0,
  skippedContainers: 0,
  invalid: 0,
  pagesFetched: 0,
  detailFetches: 0,
  blocked: false,
}

export function createDiagnostics(
  patch: Partial<ProviderDiagnostics> & Pick<ProviderDiagnostics, 'status'>
): ProviderDiagnostics {
  return { ...EMPTY_PROVIDER_DIAGNOSTICS, ...patch }
}

export function isOccurrenceFirstRequested(params: EventProviderParams = {}): boolean {
  if (params.occurrenceFirst === true) return true
  return readEnv('EVENTS_OCCURRENCE_V1')?.toLowerCase() === 'true'
}

export function inferHealthFromEvents(events: NaEvent[]): ProviderDiagnostics {
  return createDiagnostics({
    status: events.length > 0 ? 'SUCCESS' : 'EMPTY',
    discovered: events.length,
    occurrences: events.length,
  })
}

export async function runProviderFetch(
  provider: EventProvider,
  params: EventProviderParams = {}
): Promise<ProviderFetchResult> {
  if (provider.fetchWithDiagnostics) {
    return provider.fetchWithDiagnostics(params)
  }
  const events = await provider.fetchEvents(params)
  return { events, diagnostics: inferHealthFromEvents(events) }
}

export function finalizeDiagnostics(
  diagnostics: ProviderDiagnostics,
  events: NaEvent[]
): ProviderDiagnostics {
  const next = { ...diagnostics, occurrences: events.length }
  if (next.blocked) {
    next.status = events.length > 0 ? 'PARTIAL' : 'BLOCKED'
    return next
  }
  if (next.status === 'FETCH_FAILED' || next.status === 'RATE_LIMITED') {
    if (events.length > 0) next.status = 'PARTIAL'
    return next
  }
  if (events.length === 0) {
    next.status = next.status === 'SUCCESS' || next.status === 'EMPTY' ? 'EMPTY' : next.status
    return next
  }
  if (next.status === 'PARTIAL') return next
  next.status = 'SUCCESS'
  return next
}
