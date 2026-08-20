/**
 * Phase 4C.1 — single authorized event for real paid canary.
 * Not transferable. Global AI dispatch stays off.
 */
export const PHASE_4C1_AUTHORIZED_EVENT_ID = 'cl_7457f2e8-d45f-44e2-a50c-dbc467a3454c' as const

export function isAuthorizedPaidCanaryEvent(eventId: string): boolean {
  return eventId === PHASE_4C1_AUTHORIZED_EVENT_ID
}
