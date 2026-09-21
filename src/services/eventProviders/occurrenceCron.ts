/**
 * Occurrence-first incremental cron engine.
 * SHADOW is the default: real discovery + plan, zero event writes.
 */
import { TURKISH_PROVINCES } from '@/constants/cities'
import { Collections } from '@/lib/firebase/collections'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { findReconcilePairs } from '@/services/eventProviders/occurrenceReconcile'
import { prepareCanaryOccurrences } from '@/services/eventProviders/canarySanitize'
import { runProviderFetch } from '@/services/eventProviders/diagnostics'
import { biletixProvider, loadBiletixPerformanceIndex } from '@/services/eventProviders/biletix'
import { bubiletProvider, bubiletListingKeyFromTicketUrl } from '@/services/eventProviders/bubilet'
import { fetchBiletimgoUnique } from '@/services/eventProviders/biletimgoUnique'
import { ticketmasterProvider } from '@/services/eventProviders/ticketmaster'
import { providerLog } from '@/services/eventProviders/shared'
import { classifyBiletixTicketEvidence } from '@/services/eventProviders/ticketUrl'
import { providerOccurrenceKey } from '@/services/eventProviders/occurrenceMutation'
import { clampPages } from '@/services/eventProviders/providerFetchPolicy'
import {
  BILETIX_CITY_MAX_PAGES,
  BILETIX_CRON_STRATEGY,
  BILETIX_NATIONAL_CRON_PAGES,
  filterEventsToProvinces,
  shouldUseCityPartitionedBiletix,
  type BiletixDiscoveryStrategy,
} from '@/services/eventProviders/biletixDiscovery'
import type { NaEvent } from '@/types/event'
import type { ProviderHealthStatus } from '@/services/eventProviders/types'
import type { EventSyncRouteState, OccurrenceRunHealth } from '@/lib/eventSyncRoutePolicy'
import {
  type OccurrenceCheckpoint,
  type OccurrenceCheckpointStore,
  advanceProviderCursor,
  cycleComplete,
  markCycleComplete,
  resolveCheckpointOrRestart,
} from '@/lib/eventSyncCheckpoint'
import {
  OCCURRENCE_CITY_CONCURRENCY,
  OCCURRENCE_PREFERRED_INVOCATION_MS,
  shouldStartNextUnit,
} from '@/services/eventProviders/occurrenceRuntimeBudget'
import {
  mapLimit,
  nextWorkUnit,
  planProviderBatches,
  type OccurrenceWorkUnit,
} from '@/services/eventProviders/occurrenceBatchPlanner'

export type OccurrenceCronMode = 'shadow' | 'write'

export const OCCURRENCE_CRON_WRITE_SOURCES = ['biletix', 'bubilet', 'biletimgo'] as const
export const BUBILET_PER_CITY_DETAIL_BUDGET = 8
export const BUBILET_GLOBAL_DETAIL_BUDGET = 240
export const BUBILET_DETAIL_CONCURRENCY = 4
export const BILETIX_NATIONAL_MAX_PAGES = BILETIX_NATIONAL_CRON_PAGES

export interface OccurrenceCronOptions {
  mode?: OccurrenceCronMode
  /** Required to actually mutate events. Route/production never pass this in V2.7. */
  allowWrite?: boolean
  includeTicketmasterShadow?: boolean
  maxDetailsPerCity?: number
  maxDetailsGlobal?: number
  maxPages?: number
  nowIso?: string
  citySlugs?: string[]
  biletixStrategy?: BiletixDiscoveryStrategy
  deadlineMs?: number
  cityConcurrency?: number
  resumable?: boolean
  persistCheckpoint?: boolean
  checkpointStore?: OccurrenceCheckpointStore
  existingLoader?: (input?: { sources?: string[]; citySlugs?: string[] }) => Promise<NaEvent[]>
  biletimgoCities?: string[]
}

export interface OccurrenceCronSummary {
  runId: string
  mode: OccurrenceCronMode
  scope: string[]
  startedAt: string
  finishedAt: string
  durationMs: number
  lockStatus: 'unused' | 'acquired' | 'busy' | 'released' | 'released_after_error'
  citiesProcessed: number
  rawDiscoveries: number
  uniqueIds: number
  normalizedOccurrences: number
  wouldInsert: number
  wouldUpdate: number
  wouldSkipUnchanged: number
  wouldSkipInvalid: number
  wouldDelete: 0
  inserted: number
  updated: number
  deleted: 0
  abortedWrite: boolean
  abortReason: string | null
  firestoreEventWrites: number
  providerStatus: Record<string, ProviderHealthStatus | 'CONFIG_UNAVAILABLE'>
  cityHealth: Record<string, number>
  requests: {
    listing: number
    detail: number
    detailsAvoided: number
    retries: number
    timeouts: number
    blocked: number
    rateLimited: number
  }
  biletix: {
    occurrences: number
    unverified001: number
    pages: number
    strategy: BiletixDiscoveryStrategy
    numFound?: number
  }
  bubilet: {
    occurrences: number
    detailsFetched: number
    detailsAvoided: number
    perCityBudget: number
    globalBudget: number
    cityHealth: Record<string, number>
  }
  biletimgo: { rawListing: number; uniqueIds: number; detailsAvoided: number; occurrences: number }
  ticketmaster?: {
    status: ProviderHealthStatus | 'CONFIG_UNAVAILABLE'
    occurrences: number
    overlap: { EXACT: number; HIGH_CONFIDENCE: number; AMBIGUOUS: number; DISTINCT: number }
  }
  reconciliation: { EXACT: number; HIGH_CONFIDENCE: number; AMBIGUOUS: number; DISTINCT: number }
  uniqueProviderIds: string[]
  writePlan: Array<{
    province: string
    provider: string
    eventId: string
    title: string
    operation: 'INSERT' | 'UPDATE' | 'SKIP'
  }>
  mutationClasses: {
    NEW_SOURCE_OCCURRENCE: number
    MATERIAL_UPDATE: number
    EXPECTED_REFRESH: number
    SUSPICIOUS_REINSERT: number
  }
  existingByProviderKey: Record<string, string>
  cycleId: string
  cycleComplete: boolean
  invocationHealth: OccurrenceRunHealth
  checkpointBefore: OccurrenceCheckpoint | null
  checkpointAfter: OccurrenceCheckpoint | null
  checkpointRestarted: boolean
  batch: { provider: string; cities: string[]; batchIndex: number }[]
  cycleProgress: {
    biletix: { done: number; total: number; completed: boolean }
    bubilet: { done: number; total: number; detailsUsed: number; completed: boolean }
    biletimgo: { completed: boolean }
  }
  timings: {
    existingDbMs: number
    biletixDiscoveryMs: number
    biletixNormalizeMs: number
    bubiletListingMs: number
    bubiletDetailMs: number
    biletimgoCalendarMs: number
    biletimgoDetailMs: number
    reconcileMs: number
    checkpointMs: number
  }
  runHealth: OccurrenceRunHealth
  configuration: {
    state: EventSyncRouteState | 'INTERNAL'
    biletixStrategy: BiletixDiscoveryStrategy
    includeTicketmasterShadow: boolean
    flags: {
      occurrence: boolean
      write: boolean
      kill: boolean
      biletimgoEnabled: boolean
    }
  }
  writeable: NaEvent[]
}

export function rotateCityOrder(slugs: string[], seed: number): string[] {
  if (slugs.length === 0) return []
  const offset = ((seed % slugs.length) + slugs.length) % slugs.length
  return [...slugs.slice(offset), ...slugs.slice(0, offset)]
}

export function istanbulDayOfYear(iso: string): number {
  const date = new Date(iso)
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  return Math.floor((date.getTime() - start) / 86_400_000)
}

export function assertWritePlanSafe(plan: { wouldDelete: number }): { ok: true } | { ok: false; reason: 'wouldDelete' } {
  if (plan.wouldDelete !== 0) return { ok: false, reason: 'wouldDelete' }
  return { ok: true }
}

export function decideOccurrenceWrite(input: {
  mode: OccurrenceCronMode
  allowWrite?: boolean
  wouldDelete: number
}): { action: 'shadow' | 'write' | 'abort'; reason: string | null } {
  if (input.mode !== 'write') return { action: 'shadow', reason: null }
  if (input.wouldDelete !== 0) return { action: 'abort', reason: 'wouldDelete' }
  if (!input.allowWrite) return { action: 'abort', reason: 'write_not_armed' }
  return { action: 'write', reason: null }
}

export function biletimgoDetailsAvoided(rawListing: number, uniqueIds: number, knownSkipped = 0): number {
  return Math.max(0, rawListing - uniqueIds) + knownSkipped
}

function increment(map: Record<string, number>, key: string, by = 1) {
  map[key] = (map[key] ?? 0) + by
}

function countPairs(events: NaEvent[]) {
  const pairs = findReconcilePairs(events)
  return {
    EXACT: pairs.filter((p) => p.confidence === 'EXACT').length,
    HIGH_CONFIDENCE: pairs.filter((p) => p.confidence === 'HIGH_CONFIDENCE').length,
    AMBIGUOUS: pairs.filter((p) => p.confidence === 'AMBIGUOUS').length,
    DISTINCT: pairs.filter((p) => p.confidence === 'DISTINCT').length,
  }
}

export async function loadExistingOccurrences(filter?: {
  sources?: readonly string[]
  citySlugs?: string[]
}): Promise<NaEvent[]> {
  const db = getAdminFirestore()
  const events: NaEvent[] = []
  const sources = filter?.sources ?? OCCURRENCE_CRON_WRITE_SOURCES
  const citySet = filter?.citySlugs ? new Set(filter.citySlugs) : null
  for (const source of sources) {
    const snap = await db.collection(Collections.EVENTS).where('source', '==', source).get()
    for (const doc of snap.docs) {
      const row = { id: doc.id, ...(doc.data() as Omit<NaEvent, 'id'>) }
      if (citySet && row.citySlug && !citySet.has(row.citySlug) && source !== 'biletimgo') {
        continue
      }
      events.push(row)
    }
  }
  return events
}

function cycleProgressFrom(
  checkpoint: OccurrenceCheckpoint,
  batches: ReturnType<typeof planProviderBatches>
) {
  return {
    biletix: {
      done: checkpoint.biletix.completed ? batches.biletix.length : checkpoint.biletix.nextIndex,
      total: batches.biletix.length,
      completed: checkpoint.biletix.completed,
    },
    bubilet: {
      done: checkpoint.bubilet.completed ? batches.bubilet.length : checkpoint.bubilet.nextIndex,
      total: batches.bubilet.length,
      completed: checkpoint.bubilet.completed,
      detailsUsed: checkpoint.bubilet.detailsUsed ?? 0,
    },
    biletimgo: { completed: checkpoint.biletimgo.completed },
  }
}

function markProviderExhausted(
  checkpoint: OccurrenceCheckpoint,
  batches: ReturnType<typeof planProviderBatches>
): OccurrenceCheckpoint {
  let next = checkpoint
  if (!next.biletix.completed && next.biletix.nextIndex >= batches.biletix.length) {
    next = { ...next, biletix: { ...next.biletix, completed: true } }
  }
  if (!next.bubilet.completed && next.bubilet.nextIndex >= batches.bubilet.length) {
    next = { ...next, bubilet: { ...next.bubilet, completed: true } }
  }
  return next
}

export async function runOccurrenceCron(
  options: OccurrenceCronOptions = {}
): Promise<OccurrenceCronSummary> {
  const mode: OccurrenceCronMode = options.mode === 'write' ? 'write' : 'shadow'
  const startedAt = options.nowIso ?? new Date().toISOString()
  const startedMs = Date.now()
  const runId = `occ-${startedAt.replace(/[:.]/g, '-')}`
  const slugs = options.citySlugs ?? TURKISH_PROVINCES.map((p) => p.slug)
  const cities = rotateCityOrder(slugs, istanbulDayOfYear(startedAt))
  const perCity = options.maxDetailsPerCity ?? BUBILET_PER_CITY_DETAIL_BUDGET
  const globalDetails = options.maxDetailsGlobal ?? BUBILET_GLOBAL_DETAIL_BUDGET
  const biletixStrategy = options.biletixStrategy ?? BILETIX_CRON_STRATEGY
  const useCityBiletix = shouldUseCityPartitionedBiletix({
    strategy: biletixStrategy,
    citySlugs: slugs,
  })
  const maxPages = clampPages(
    options.maxPages ?? (useCityBiletix ? BILETIX_CITY_MAX_PAGES : BILETIX_NATIONAL_MAX_PAGES)
  )
  const deadlineMs = options.deadlineMs ?? OCCURRENCE_PREFERRED_INVOCATION_MS
  const concurrency = options.cityConcurrency ?? OCCURRENCE_CITY_CONCURRENCY
  const useStoredCheckpoint = options.resumable ?? options.citySlugs === undefined
  const persistCheckpoint = options.persistCheckpoint === true
  const loadExisting = options.existingLoader ?? loadExistingOccurrences

  const timings = {
    existingDbMs: 0,
    biletixDiscoveryMs: 0,
    biletixNormalizeMs: 0,
    bubiletListingMs: 0,
    bubiletDetailMs: 0,
    biletimgoCalendarMs: 0,
    biletimgoDetailMs: 0,
    reconcileMs: 0,
    checkpointMs: 0,
  }

  let checkpointBefore: OccurrenceCheckpoint | null = null
  let checkpointRestarted = false
  const checkpointLoadStarted = Date.now()
  let checkpoint: OccurrenceCheckpoint
  if (useStoredCheckpoint && options.checkpointStore) {
    const stored = await options.checkpointStore.load()
    checkpointBefore = stored
    const resolved = resolveCheckpointOrRestart(stored, startedAt)
    checkpointRestarted = resolved.restarted
    checkpoint = resolved.checkpoint
  } else {
    checkpoint = resolveCheckpointOrRestart(null, startedAt).checkpoint
    checkpointRestarted = true
  }
  timings.checkpointMs += Date.now() - checkpointLoadStarted

  const batches = planProviderBatches({ slugs, rotatedBubilet: cities })
  checkpoint = markProviderExhausted(checkpoint, batches)

  const cityHealth: Record<string, number> = {
    SUCCESS: 0,
    EMPTY: 0,
    PARTIAL: 0,
    FETCH_FAILED: 0,
    BLOCKED: 0,
    RATE_LIMITED: 0,
  }
  const requests = {
    listing: 0,
    detail: 0,
    detailsAvoided: 0,
    retries: 0,
    timeouts: 0,
    blocked: 0,
    rateLimited: 0,
  }

  const sitemapStarted = Date.now()
  const sitemap = await loadBiletixPerformanceIndex()
  timings.biletixDiscoveryMs += Date.now() - sitemapStarted
  if (sitemap) requests.listing += 1
  const unverified: NaEvent[] = []
  const biletixEvents: NaEvent[] = []
  const seenBiletix = new Set<string>()
  let biletixStatus: ProviderHealthStatus = 'EMPTY'
  let biletixPages = 0
  let biletixNumFound = 0
  let biletixDiscovered = 0
  const bubiletEvents: NaEvent[] = []
  let bubiletDetails = 0
  let bubiletAvoided = 0
  let goEvents: NaEvent[] = []
  let goRawListing = 0
  let goUniqueIds = 0
  let goDetailsAvoided = 0
  let goStatus: ProviderHealthStatus = 'EMPTY'
  const processedUnits: OccurrenceWorkUnit[] = []
  const existing: NaEvent[] = []
  const citiesProcessed = new Set<string>()

  const consumeBiletix = (fetched: Awaited<ReturnType<typeof runProviderFetch>>) => {
    const normalizeStarted = Date.now()
    biletixPages += fetched.diagnostics.pagesFetched
    biletixDiscovered += fetched.diagnostics.discovered
    if (typeof fetched.diagnostics.numFound === 'number') {
      biletixNumFound = Math.max(biletixNumFound, fetched.diagnostics.numFound)
    }
    if (fetched.diagnostics.status !== 'EMPTY') biletixStatus = fetched.diagnostics.status
    else if (biletixStatus === 'EMPTY' && fetched.events.length > 0) biletixStatus = 'SUCCESS'
    for (const event of fetched.events) {
      const identity = event.externalId ?? event.id
      if (seenBiletix.has(identity)) continue
      seenBiletix.add(identity)
      const unique = event.externalId ? sitemap?.uniqueUrlByCode.get(event.externalId) ?? null : null
      const evidence = classifyBiletixTicketEvidence(event.ticketUrl, unique)
      if (evidence === 'UNVERIFIED_001') unverified.push(event)
      else biletixEvents.push(event)
    }
    timings.biletixNormalizeMs += Date.now() - normalizeStarted
  }

  async function processBiletixCities(citySlugs: string[]) {
    if (!useCityBiletix) {
      const bxStarted = Date.now()
      const bx = await runProviderFetch(biletixProvider, {
        occurrenceFirst: true,
        maxPages,
      })
      timings.biletixDiscoveryMs += Date.now() - bxStarted
      requests.listing += bx.diagnostics.pagesFetched
      consumeBiletix(bx)
      if (bx.diagnostics.status) biletixStatus = bx.diagnostics.status
      return
    }
    const bxStarted = Date.now()
    const fetched = await mapLimit(citySlugs, concurrency, async (citySlug, index) => {
      if (index % 15 === 0) {
        providerLog('occurrenceCron', `biletix city ${index + 1}/${citySlugs.length} ${citySlug}`)
      }
      citiesProcessed.add(citySlug)
      return runProviderFetch(biletixProvider, {
        citySlug,
        occurrenceFirst: true,
        maxPages,
      })
    })
    timings.biletixDiscoveryMs += Date.now() - bxStarted
    for (const bx of fetched) {
      requests.listing += bx.diagnostics.pagesFetched
      consumeBiletix(bx)
    }
  }

  async function processBubiletCities(citySlugs: string[]) {
    const dbStarted = Date.now()
    const cityExisting = await loadExisting({ sources: ['bubilet'], citySlugs })
    timings.existingDbMs += Date.now() - dbStarted
    existing.push(...cityExisting)
    let detailBudgetLeft = Math.max(0, globalDetails - (checkpoint.bubilet.detailsUsed ?? 0))
    for (const [index, citySlug] of citySlugs.entries()) {
      if (index % 15 === 0) {
        providerLog('occurrenceCron', `bubilet city ${index + 1}/${citySlugs.length} ${citySlug}`)
      }
      citiesProcessed.add(citySlug)
      const cityKnown = cityExisting
        .filter((event) => event.citySlug === citySlug)
        .map((event) => bubiletListingKeyFromTicketUrl(event.ticketUrl))
        .filter((key): key is string => Boolean(key))
      const budget = Math.min(perCity, detailBudgetLeft)
      const buStarted = Date.now()
      const bu = await runProviderFetch(bubiletProvider, {
        citySlug,
        occurrenceFirst: true,
        maxDetails: budget,
        knownListingKeys: cityKnown,
      })
      timings.bubiletListingMs += Date.now() - buStarted
      increment(cityHealth, bu.diagnostics.status)
      requests.listing += bu.diagnostics.pagesFetched
      requests.detail += bu.diagnostics.detailFetches
      bubiletDetails += bu.diagnostics.detailFetches
      detailBudgetLeft = Math.max(0, detailBudgetLeft - bu.diagnostics.detailFetches)
      if (bu.diagnostics.status === 'BLOCKED') requests.blocked += 1
      if (bu.diagnostics.status === 'RATE_LIMITED') requests.rateLimited += 1
      if (bu.diagnostics.status === 'PARTIAL' || bu.diagnostics.detailFetches === 0) {
        bubiletAvoided += cityKnown.length
      }
      bubiletEvents.push(...bu.events)
    }
  }

  async function processBiletimgo(citySlugs: string[]) {
    const dbStarted = Date.now()
    const goExisting = await loadExisting({ sources: ['biletimgo'] })
    timings.existingDbMs += Date.now() - dbStarted
    existing.push(...goExisting)
    const goKnown = goExisting
      .filter((event) => event.externalId)
      .map((event) => event.externalId!)
    const goCities = options.biletimgoCities ?? citySlugs
    const go = await fetchBiletimgoUnique(goCities, { knownExternalIds: goKnown })
    timings.biletimgoCalendarMs += go.listingDurationMs ?? 0
    timings.biletimgoDetailMs += go.detailDurationMs ?? 0
    requests.listing += go.listingRequests
    requests.detail += go.detailRequests
    requests.detailsAvoided += go.detailsAvoided
    goEvents = go.events
    goRawListing = go.rawListingDiscoveries
    goUniqueIds = go.uniqueExternalIds
    goDetailsAvoided = go.detailsAvoided
    goStatus = go.diagnostics.status
    for (const city of goCities) citiesProcessed.add(city)
  }

  async function persist(next: OccurrenceCheckpoint) {
    if (!persistCheckpoint || !options.checkpointStore) return
    const started = Date.now()
    await options.checkpointStore.save(next)
    timings.checkpointMs += Date.now() - started
  }

  while (shouldStartNextUnit({ elapsedMs: Date.now() - startedMs, deadlineMs })) {
    checkpoint = markProviderExhausted(checkpoint, batches)
    const unit = nextWorkUnit(checkpoint, batches)
    if (!unit) break
    providerLog('occurrenceCron', `${unit.provider} batch ${unit.batchIndex} cities=${unit.cities.length}`)
    if (unit.provider === 'biletix') {
      await processBiletixCities(unit.cities)
      const biletixDone = !useCityBiletix || checkpoint.biletix.nextIndex + 1 >= batches.biletix.length
      checkpoint = {
        ...checkpoint,
        biletix: advanceProviderCursor(checkpoint.biletix, {
          nextIndex: useCityBiletix ? checkpoint.biletix.nextIndex + 1 : batches.biletix.length,
          completed: biletixDone,
        }),
        lastCompletedAt: new Date().toISOString(),
      }
    } else if (unit.provider === 'bubilet') {
      const detailsBefore = bubiletDetails
      await processBubiletCities(unit.cities)
      const used = (checkpoint.bubilet.detailsUsed ?? 0) + (bubiletDetails - detailsBefore)
      checkpoint = {
        ...checkpoint,
        bubilet: advanceProviderCursor(checkpoint.bubilet, {
          nextIndex: checkpoint.bubilet.nextIndex + 1,
          completed: checkpoint.bubilet.nextIndex + 1 >= batches.bubilet.length,
          detailsUsed: used,
        }),
        lastCompletedAt: new Date().toISOString(),
      }
    } else {
      await processBiletimgo(unit.cities)
      checkpoint = {
        ...checkpoint,
        biletimgo: advanceProviderCursor(checkpoint.biletimgo, {
          nextIndex: 1,
          completed: true,
        }),
        lastCompletedAt: new Date().toISOString(),
      }
    }
    processedUnits.push(unit)
    checkpoint = markProviderExhausted(checkpoint, batches)
    if (cycleComplete(checkpoint)) {
      checkpoint = markCycleComplete(checkpoint, new Date().toISOString())
    }
    await persist(checkpoint)
  }

  requests.detailsAvoided += bubiletAvoided

  let tmShadow: OccurrenceCronSummary['ticketmaster']
  const runTm =
    options.includeTicketmasterShadow !== false &&
    (cycleComplete(checkpoint) || options.citySlugs !== undefined)
  if (runTm) {
    if (!ticketmasterProvider.isEnabled()) {
      tmShadow = {
        status: 'CONFIG_UNAVAILABLE',
        occurrences: 0,
        overlap: { EXACT: 0, HIGH_CONFIDENCE: 0, AMBIGUOUS: 0, DISTINCT: 0 },
      }
    } else {
      const tm = await runProviderFetch(ticketmasterProvider, {
        occurrenceFirst: true,
        maxPages: 3,
      })
      requests.listing += tm.diagnostics.pagesFetched
      const overlap = countPairs([...biletixEvents, ...tm.events])
      tmShadow = {
        status: tm.diagnostics.status,
        occurrences: tm.events.length,
        overlap,
      }
    }
  }

  const reconcileStarted = Date.now()
  const discovered = filterEventsToProvinces(
    [...biletixEvents, ...bubiletEvents, ...goEvents],
    slugs
  )
  const writeable: NaEvent[] = []
  const invalid: Array<{ id: string; reason: string }> = []
  for (const event of discovered) {
    const slug = event.citySlug
    if (!slug) {
      invalid.push({ id: event.id, reason: 'invalid_province' })
      continue
    }
    if (!slugs.includes(slug)) {
      invalid.push({ id: event.id, reason: 'out_of_scope' })
      continue
    }
    const prepared = prepareCanaryOccurrences([event], slug)
    writeable.push(...prepared.writeable)
    for (const row of prepared.skippedInvalid) {
      invalid.push({ id: row.event.id, reason: row.reason })
    }
  }
  const reconciliation = countPairs(writeable)
  timings.reconcileMs += Date.now() - reconcileStarted

  const wouldSkipUnchanged = 0
  const inserted = 0
  const updated = 0
  const firestoreEventWrites = 0
  const abortedWrite = mode === 'write' && !options.allowWrite
  const abortReason = abortedWrite ? 'write_not_armed' : null

  const finishedAt = new Date().toISOString()
  const uniqueIds = [...new Set(discovered.map((event) => `${event.source}:${event.externalId ?? event.id}`))]

  const processedBiletix = processedUnits.some((unit) => unit.provider === 'biletix')
  const processedBubilet = processedUnits.some((unit) => unit.provider === 'bubilet')
  const providerStatus: OccurrenceCronSummary['providerStatus'] = {
    biletix: processedBiletix
      ? biletixEvents.length > 0 && biletixStatus === 'EMPTY'
        ? 'SUCCESS'
        : biletixStatus
      : checkpoint.biletix.completed || (checkpoint.biletix.nextIndex ?? 0) > 0
        ? 'SUCCESS'
        : 'EMPTY',
    bubilet: !processedBubilet
      ? checkpoint.bubilet.completed || (checkpoint.bubilet.nextIndex ?? 0) > 0
        ? 'SUCCESS'
        : 'EMPTY'
      : Object.entries(cityHealth).some(([key, n]) => n > 0 && ['BLOCKED', 'FETCH_FAILED', 'RATE_LIMITED'].includes(key))
      ? cityHealth.BLOCKED
        ? 'BLOCKED'
        : cityHealth.FETCH_FAILED
          ? 'FETCH_FAILED'
          : cityHealth.RATE_LIMITED
            ? 'RATE_LIMITED'
            : 'PARTIAL'
      : cityHealth.PARTIAL
        ? 'PARTIAL'
        : cityHealth.SUCCESS
          ? 'SUCCESS'
          : processedUnits.some((unit) => unit.provider === 'bubilet')
            ? 'EMPTY'
            : 'EMPTY',
    biletimgo: goStatus,
    ticketmaster: tmShadow?.status ?? 'CONFIG_UNAVAILABLE',
  }

  return {
    runId,
    mode,
    scope: slugs,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startedMs,
    citiesProcessed: citiesProcessed.size || processedUnits.reduce((n, unit) => n + unit.cities.length, 0),
    rawDiscoveries: biletixDiscovered + goRawListing + bubiletEvents.length,
    uniqueIds: uniqueIds.length,
    normalizedOccurrences: writeable.length,
    wouldInsert: 0,
    wouldUpdate: 0,
    wouldSkipUnchanged,
    wouldSkipInvalid: invalid.length,
    wouldDelete: 0,
    inserted,
    updated,
    deleted: 0,
    abortedWrite,
    abortReason,
    lockStatus: 'unused',
    firestoreEventWrites,
    providerStatus,
    cityHealth,
    requests,
    biletix: {
      occurrences: biletixEvents.length,
      unverified001: unverified.length,
      pages: biletixPages,
      strategy: useCityBiletix ? 'city_partition' : biletixStrategy,
      numFound: biletixNumFound || undefined,
    },
    bubilet: {
      occurrences: bubiletEvents.length,
      detailsFetched: bubiletDetails,
      detailsAvoided: bubiletAvoided,
      perCityBudget: perCity,
      globalBudget: globalDetails,
      cityHealth,
    },
    biletimgo: {
      rawListing: goRawListing,
      uniqueIds: goUniqueIds,
      detailsAvoided: goDetailsAvoided,
      occurrences: goEvents.length,
    },
    ticketmaster: tmShadow,
    reconciliation,
    uniqueProviderIds: uniqueIds,
    writePlan: [],
    mutationClasses: {
      NEW_SOURCE_OCCURRENCE: 0,
      MATERIAL_UPDATE: 0,
      EXPECTED_REFRESH: 0,
      SUSPICIOUS_REINSERT: 0,
    },
    cycleId: checkpoint.cycleId,
    cycleComplete: cycleComplete(checkpoint),
    invocationHealth: 'SUCCESS',
    checkpointBefore,
    checkpointAfter: checkpoint,
    checkpointRestarted,
    batch: processedUnits.map((unit) => ({
      provider: unit.provider,
      cities: unit.cities,
      batchIndex: unit.batchIndex,
    })),
    cycleProgress: cycleProgressFrom(checkpoint, batches),
    timings,
    runHealth: 'SUCCESS',
    configuration: {
      state: 'INTERNAL',
      biletixStrategy: useCityBiletix ? 'city_partition' : biletixStrategy,
      includeTicketmasterShadow: options.includeTicketmasterShadow !== false,
      flags: {
        occurrence: process.env.EVENTS_OCCURRENCE_V1?.toLowerCase() === 'true',
        write: process.env.EVENTS_OCCURRENCE_WRITE?.toLowerCase() === 'true',
        kill: process.env.EVENTS_OCCURRENCE_WRITE_KILL?.toLowerCase() === 'true',
        biletimgoEnabled: process.env.BILETIMGO_ENABLED?.toLowerCase() === 'true',
      },
    },
    existingByProviderKey: Object.fromEntries(
      existing
        .filter((event) => event.source && (event.externalId || event.id))
        .map((event) => [providerOccurrenceKey(event), event.id])
    ),
    writeable,
  }
}

export function isOccurrenceCronPartial(summary: OccurrenceCronSummary): boolean {
  return ['PARTIAL', 'BLOCKED', 'FETCH_FAILED', 'RATE_LIMITED'].includes(
    summary.providerStatus.bubilet ?? ''
  ) || ['PARTIAL', 'BLOCKED', 'FETCH_FAILED', 'RATE_LIMITED'].includes(
    summary.providerStatus.biletix ?? ''
  )
}
