import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  CIRCUIT_BREAKER_DOC_ID,
  tripExpandedHierarchyCircuit,
  type CircuitBreakerMetrics,
} from './scaleCircuitBreaker'

export async function loadExpandedHierarchyCircuitFromStore(): Promise<void> {
  const snap = await getAdminFirestore()
    .collection(Collections.AI_EDITORIAL_CONFIG)
    .doc(CIRCUIT_BREAKER_DOC_ID)
    .get()
  if (!snap.exists) return
  const data = snap.data() as { tripped?: boolean; reason?: string }
  if (data.tripped) tripExpandedHierarchyCircuit(data.reason || 'firestore circuit')
}

export async function persistCircuitBreakerState(input: {
  tripped: boolean
  reason: string | null
  metrics: CircuitBreakerMetrics
  wave: string
}): Promise<void> {
  if (input.tripped && input.reason) tripExpandedHierarchyCircuit(input.reason)
  await getAdminFirestore()
    .collection(Collections.AI_EDITORIAL_CONFIG)
    .doc(CIRCUIT_BREAKER_DOC_ID)
    .set(
      {
        tripped: input.tripped,
        reason: input.reason,
        metrics: input.metrics,
        wave: input.wave,
        updatedAt: Date.now(),
      },
      { merge: true }
    )
}
