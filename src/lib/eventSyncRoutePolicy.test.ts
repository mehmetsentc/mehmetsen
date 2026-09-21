import { describe, expect, it } from 'vitest'
import { BILETIX_CRON_STRATEGY } from '@/services/eventProviders/biletixDiscovery'
import {
  OCCURRENCE_CRON_INCLUDES_BILETIMGO,
  OCCURRENCE_WRITE_REQUIRES_BILETIMGO_ENABLED,
  allowWriteFromHttpRequest,
  classifyOccurrenceRunHealth,
  executeScheduledEventSync,
  httpSyncOverridesIgnored,
  occurrenceFlagTruthTable,
  resolveEventSyncRouteState,
  scheduledBiletixStrategy,
  scheduledOccurrenceWriteArmed,
  selectScheduledEventSync,
} from './eventSyncRoutePolicy'

function env(flags: { occurrence?: boolean; write?: boolean; kill?: boolean; cronMode?: string }): NodeJS.ProcessEnv {
  return {
    EVENTS_OCCURRENCE_V1: flags.occurrence ? 'true' : 'false',
    EVENTS_OCCURRENCE_WRITE: flags.write ? 'true' : 'false',
    EVENTS_OCCURRENCE_WRITE_KILL: flags.kill ? 'true' : 'false',
    ...(flags.cronMode ? { EVENTS_OCCURRENCE_CRON_MODE: flags.cronMode } : {}),
  }
}

describe('event sync route state machine', () => {
  it('selects exactly one path from the flag truth table', () => {
    for (const row of occurrenceFlagTruthTable()) {
      const state = resolveEventSyncRouteState(
        env({ occurrence: row.occurrence, write: row.write, kill: row.kill })
      )
      expect(state).toBe(row.state)
      const plan = selectScheduledEventSync(
        env({ occurrence: row.occurrence, write: row.write, kill: row.kill })
      )
      expect(plan.invokeLegacy && plan.invokeOccurrence).toBe(false)
      expect(plan.invokeLegacy || plan.invokeOccurrence).toBe(true)
      expect(plan.fallbackToLegacyOnError).toBe(false)
      expect(plan.allowWrite).toBe(row.state === 'OCCURRENCE_WRITE')
    }
  })

  it('keeps the kill switch on occurrence shadow and does not re-enable legacy', () => {
    const plan = selectScheduledEventSync(env({ occurrence: true, write: true, kill: true }))
    expect(plan.state).toBe('OCCURRENCE_SHADOW')
    expect(plan.allowWrite).toBe(false)
    expect(plan.invokeLegacy).toBe(false)
    expect(plan.killSwitch).toBe(true)
  })

  it('never falls back to legacy when the occurrence path throws', async () => {
    const calls: string[] = []
    await expect(
      executeScheduledEventSync(selectScheduledEventSync(env({ occurrence: true, write: true })), {
        legacy: async () => {
          calls.push('legacy')
          return 'legacy'
        },
        occurrence: async () => {
          calls.push('occurrence')
          throw new Error('biletix-down')
        },
      })
    ).rejects.toThrow('biletix-down')
    expect(calls).toEqual(['occurrence'])
  })

  it('ignores public request overrides for write, mode, scope, and providers', () => {
    const params = new URLSearchParams('allowWrite=true&mode=write&citySlugs=istanbul&providers=ticketmaster')
    const body = { allowWrite: true, mode: 'write', citySlugs: ['istanbul'], providers: ['ticketmaster'] }
    expect(allowWriteFromHttpRequest(params, body)).toBe(false)
    expect(httpSyncOverridesIgnored(params, body)).toEqual({
      allowWrite: false,
      mode: null,
      citySlugs: null,
      providers: null,
    })
    expect(selectScheduledEventSync(env({ occurrence: true, write: true })).allowWrite).toBe(true)
    expect(scheduledOccurrenceWriteArmed(env({ occurrence: false, write: true }), params, body)).toBe(
      false
    )
    expect(allowWriteFromHttpRequest(params, body)).toBe(false)
  })

  it('includes BiletimGO on the occurrence path without requiring BILETIMGO_ENABLED', () => {
    expect(OCCURRENCE_WRITE_REQUIRES_BILETIMGO_ENABLED).toBe(false)
    expect(OCCURRENCE_CRON_INCLUDES_BILETIMGO).toBe(true)
  })

  it('forces scheduled occurrence discovery onto Biletix city_partition', () => {
    expect(scheduledBiletixStrategy()).toBe('city_partition')
    expect(BILETIX_CRON_STRATEGY).toBe('city_partition')
  })

  it('does not let a checkpoint change the V2.9 state machine', () => {
    expect(occurrenceFlagTruthTable().map((row) => row.state)).toEqual([
      'LEGACY',
      'LEGACY',
      'LEGACY',
      'OCCURRENCE_SHADOW',
      'OCCURRENCE_WRITE',
      'OCCURRENCE_SHADOW',
      'OCCURRENCE_SHADOW',
    ])
    expect(resolveEventSyncRouteState(env({ occurrence: true, write: true, kill: true }))).toBe(
      'OCCURRENCE_SHADOW'
    )
  })

  it('classifies PARTIAL separately from SUCCESS and FAILED', () => {
    expect(
      classifyOccurrenceRunHealth({
        biletix: 'SUCCESS',
        bubilet: 'SUCCESS',
        biletimgo: 'SUCCESS',
      })
    ).toBe('SUCCESS')
    expect(
      classifyOccurrenceRunHealth({
        biletix: 'SUCCESS',
        bubilet: 'PARTIAL',
        biletimgo: 'SUCCESS',
      })
    ).toBe('PARTIAL')
    expect(
      classifyOccurrenceRunHealth({
        biletix: 'SUCCESS',
        bubilet: 'BLOCKED',
        biletimgo: 'SUCCESS',
        wouldDelete: 0,
      })
    ).toBe('PARTIAL')
    expect(
      classifyOccurrenceRunHealth({
        biletix: 'FETCH_FAILED',
        bubilet: 'SUCCESS',
        biletimgo: 'SUCCESS',
      })
    ).toBe('FAILED')
    expect(
      classifyOccurrenceRunHealth({
        biletix: 'SUCCESS',
        bubilet: 'EMPTY',
        biletimgo: 'SUCCESS',
        wouldDelete: 1,
      })
    ).toBe('FAILED')
  })
})
