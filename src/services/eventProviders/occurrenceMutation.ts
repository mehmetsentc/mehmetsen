import type { NaEvent } from '@/types/event'

export type ProposedMutationClass =
  | 'NEW_SOURCE_OCCURRENCE'
  | 'MATERIAL_UPDATE'
  | 'EXPECTED_REFRESH'
  | 'SUSPICIOUS_REINSERT'

export function providerOccurrenceKey(event: Pick<NaEvent, 'source' | 'externalId' | 'id'>): string {
  return `${event.source}:${event.externalId ?? event.id}`
}

export function classifyProposedMutation(input: {
  operation: 'INSERT' | 'UPDATE' | 'SKIP'
  incoming: Pick<NaEvent, 'id' | 'source' | 'externalId' | 'status'>
  existingById?: Pick<NaEvent, 'id' | 'status'> | null
  existingByProviderKey?: Pick<NaEvent, 'id'> | null
}): ProposedMutationClass {
  if (input.operation === 'SKIP') return 'EXPECTED_REFRESH'
  if (input.operation === 'INSERT') {
    if (input.existingById) return 'SUSPICIOUS_REINSERT'
    if (input.existingByProviderKey && input.existingByProviderKey.id !== input.incoming.id) {
      return 'SUSPICIOUS_REINSERT'
    }
    return 'NEW_SOURCE_OCCURRENCE'
  }
  if (input.existingById?.status === 'cancelled' || input.existingById?.status === 'draft') {
    return 'EXPECTED_REFRESH'
  }
  return 'MATERIAL_UPDATE'
}

export function abortIfSuspiciousReinsert(classes: ProposedMutationClass[]): {
  ok: boolean
  suspicious: number
} {
  const suspicious = classes.filter((value) => value === 'SUSPICIOUS_REINSERT').length
  return { ok: suspicious === 0, suspicious }
}
