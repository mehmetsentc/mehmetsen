/**
 * Scheduled /api/events/sync cutover policy.
 *
 * Exactly one path per invocation:
 *   LEGACY              → syncEvents() only
 *   OCCURRENCE_SHADOW   → occurrence shadow only, zero event writes
 *   OCCURRENCE_WRITE    → occurrence write only, never syncEvents()
 *
 * HTTP query/body cannot arm writes, pick a mode, or change scope.
 * Occurrence failure never falls back to legacy markRemoved/markPast.
 */

export type EventSyncRouteState = 'LEGACY' | 'OCCURRENCE_SHADOW' | 'OCCURRENCE_WRITE'

export const OCCURRENCE_WRITE_REQUIRES_BILETIMGO_ENABLED = false
export const OCCURRENCE_CRON_INCLUDES_BILETIMGO = true

function envTrue(env: NodeJS.ProcessEnv, key: string): boolean {
  return env[key]?.toLowerCase() === 'true'
}

export function isOccurrenceCronArmed(env: NodeJS.ProcessEnv = process.env): boolean {
  return envTrue(env, 'EVENTS_OCCURRENCE_V1')
}

export function isOccurrenceWriteKillSwitchOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return envTrue(env, 'EVENTS_OCCURRENCE_WRITE_KILL')
}

export function isOccurrenceWriteRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return envTrue(env, 'EVENTS_OCCURRENCE_WRITE') || env.EVENTS_OCCURRENCE_CRON_MODE?.toLowerCase() === 'write'
}

/** @deprecated use resolveEventSyncRouteState — kept for existing tests */
export function occurrenceCronModeFromEnv(
  env: NodeJS.ProcessEnv = process.env
): 'shadow' | 'write' {
  return resolveEventSyncRouteState(env) === 'OCCURRENCE_WRITE' ? 'write' : 'shadow'
}

/** HTTP query/body cannot arm occurrence writes. Always false. */
export function allowWriteFromHttpRequest(
  _searchParams?: URLSearchParams | null,
  _body?: unknown
): false {
  return false
}

export function scheduledOccurrenceWriteArmed(
  env: NodeJS.ProcessEnv = process.env,
  searchParams?: URLSearchParams | null,
  body?: unknown
): boolean {
  if (allowWriteFromHttpRequest(searchParams, body)) return false
  return resolveEventSyncRouteState(env) === 'OCCURRENCE_WRITE'
}

export function resolveEventSyncRouteState(env: NodeJS.ProcessEnv = process.env): EventSyncRouteState {
  if (!isOccurrenceCronArmed(env)) return 'LEGACY'
  if (isOccurrenceWriteKillSwitchOn(env)) return 'OCCURRENCE_SHADOW'
  if (isOccurrenceWriteRequested(env)) return 'OCCURRENCE_WRITE'
  return 'OCCURRENCE_SHADOW'
}

export interface ScheduledEventSyncPlan {
  state: EventSyncRouteState
  invokeLegacy: boolean
  invokeOccurrence: boolean
  occurrenceMode: 'shadow' | 'write'
  allowWrite: boolean
  includeTicketmasterShadow: boolean
  fallbackToLegacyOnError: false
  killSwitch: boolean
}

export function selectScheduledEventSync(env: NodeJS.ProcessEnv = process.env): ScheduledEventSyncPlan {
  const state = resolveEventSyncRouteState(env)
  const write = state === 'OCCURRENCE_WRITE'
  return {
    state,
    invokeLegacy: state === 'LEGACY',
    invokeOccurrence: state !== 'LEGACY',
    occurrenceMode: write ? 'write' : 'shadow',
    allowWrite: write,
    includeTicketmasterShadow: state === 'OCCURRENCE_SHADOW',
    fallbackToLegacyOnError: false,
    killSwitch: isOccurrenceWriteKillSwitchOn(env),
  }
}

export async function executeScheduledEventSync<TLegacy, TOccurrence>(
  plan: ScheduledEventSyncPlan,
  handlers: {
    legacy: () => Promise<TLegacy>
    occurrence: () => Promise<TOccurrence>
  }
): Promise<TLegacy | TOccurrence> {
  if (plan.invokeLegacy && plan.invokeOccurrence) {
    throw new Error('event sync cannot invoke legacy and occurrence together')
  }
  if (plan.invokeLegacy) return handlers.legacy()
  try {
    return await handlers.occurrence()
  } catch (error) {
    if (plan.fallbackToLegacyOnError) {
      throw new Error('legacy fallback is forbidden')
    }
    throw error
  }
}

export function httpSyncOverridesIgnored(
  searchParams?: URLSearchParams | null,
  body?: unknown
): {
  allowWrite: false
  mode: null
  citySlugs: null
  providers: null
} {
  void searchParams
  void body
  return { allowWrite: false, mode: null, citySlugs: null, providers: null }
}

export function scheduledBiletixStrategy(): 'city_partition' {
  return 'city_partition'
}

export type OccurrenceRunHealth = 'SUCCESS' | 'PARTIAL' | 'FAILED'

export function classifyOccurrenceRunHealth(input: {
  abortedWrite?: boolean
  abortReason?: string | null
  wouldDelete?: number
  suspiciousReinsert?: number
  lockStatus?: string
  biletix?: string
  bubilet?: string
  biletimgo?: string
}): OccurrenceRunHealth {
  if ((input.wouldDelete ?? 0) !== 0) return 'FAILED'
  if ((input.suspiciousReinsert ?? 0) !== 0) return 'FAILED'
  if (input.lockStatus === 'busy' || input.lockStatus === 'released_after_error') return 'FAILED'
  if (
    input.abortedWrite &&
    input.abortReason &&
    !['write_not_armed', null].includes(input.abortReason)
  ) {
    return 'FAILED'
  }
  const failed = new Set(['FETCH_FAILED', 'BLOCKED', 'RATE_LIMITED'])
  if (!input.biletix || input.biletix === 'EMPTY' || failed.has(input.biletix)) return 'FAILED'
  const degraded = new Set(['PARTIAL', 'FETCH_FAILED', 'BLOCKED', 'RATE_LIMITED'])
  if (degraded.has(input.bubilet ?? '') || degraded.has(input.biletimgo ?? '')) return 'PARTIAL'
  return 'SUCCESS'
}

export function occurrenceFlagTruthTable(): Array<{
  occurrence: boolean
  write: boolean
  kill: boolean
  state: EventSyncRouteState
}> {
  return [
    { occurrence: false, write: false, kill: false, state: 'LEGACY' },
    { occurrence: false, write: true, kill: false, state: 'LEGACY' },
    { occurrence: false, write: false, kill: true, state: 'LEGACY' },
    { occurrence: true, write: false, kill: false, state: 'OCCURRENCE_SHADOW' },
    { occurrence: true, write: true, kill: false, state: 'OCCURRENCE_WRITE' },
    { occurrence: true, write: true, kill: true, state: 'OCCURRENCE_SHADOW' },
    { occurrence: true, write: false, kill: true, state: 'OCCURRENCE_SHADOW' },
  ]
}
