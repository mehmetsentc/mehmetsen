import 'server-only'

import { exactUidMatch } from '@/lib/feed/reader/exactUidMatch'
import type { SafeAuthProviderKind } from '@/lib/feed/reader/pilotIdentityDebugTypes'

/**
 * P17 historical Google-provider consumer pilot (NOT the programmatic operator).
 * Server-only — must never be imported into client bundles.
 */
export const HISTORICAL_GOOGLE_CONSUMER_PILOT_UID = 'ap3scBglLIVwflfZN4qL8PKrM1A3'

/** Programmatic operator / custom-token verification identity (current grant holder). */
export const PROGRAMMATIC_OPERATOR_PILOT_UID = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'

export type PilotIdentityDebugPayload = {
  currentUidPresent: boolean
  historicalGoogleCandidateExists: boolean
  historicalGoogleCandidateProvider: 'GOOGLE'
  currentMatchesHistoricalGooglePilot: boolean
  currentMatchesProgrammaticOperator: boolean
  currentProviderType: SafeAuthProviderKind | null
  currentFirebaseRecordValid: boolean | null
  currentDisabled: boolean | null
  currentProfileExists: boolean | null
  currentTermsAccepted: boolean | null
  historicalProviderStillGoogleLinked: boolean | null
  historicalCandidateDisabled: boolean | null
}

function mapProviderIds(ids: string[]): SafeAuthProviderKind {
  const kinds = new Set(
    ids.map((id) => {
      if (id === 'google.com') return 'GOOGLE' as const
      if (id === 'apple.com') return 'APPLE' as const
      if (id === 'password') return 'PASSWORD' as const
      return 'OTHER' as const
    })
  )
  if (kinds.size === 0) return 'NONE'
  if (kinds.size > 1) return 'MULTIPLE'
  return [...kinds][0]!
}

/**
 * Build safe identity debug for ?readerDebug=1 capability responses.
 * Never includes UID / email / tokens.
 */
export async function buildPilotIdentityDebug(opts: {
  authenticatedUid: string | null | undefined
}): Promise<PilotIdentityDebugPayload> {
  const uid = opts.authenticatedUid ?? null
  const currentUidPresent = Boolean(uid)
  const base: PilotIdentityDebugPayload = {
    currentUidPresent,
    historicalGoogleCandidateExists: true,
    historicalGoogleCandidateProvider: 'GOOGLE',
    currentMatchesHistoricalGooglePilot: exactUidMatch(uid, HISTORICAL_GOOGLE_CONSUMER_PILOT_UID),
    currentMatchesProgrammaticOperator: exactUidMatch(uid, PROGRAMMATIC_OPERATOR_PILOT_UID),
    currentProviderType: null,
    currentFirebaseRecordValid: null,
    currentDisabled: null,
    currentProfileExists: null,
    currentTermsAccepted: null,
    historicalProviderStillGoogleLinked: null,
    historicalCandidateDisabled: null,
  }

  try {
    const { getAdminAuth } = await import('@/lib/firebase/admin')
    const auth = getAdminAuth()

    try {
      const hist = await auth.getUser(HISTORICAL_GOOGLE_CONSUMER_PILOT_UID)
      base.historicalCandidateDisabled = Boolean(hist.disabled)
      base.historicalProviderStillGoogleLinked = (hist.providerData ?? []).some(
        (p) => p.providerId === 'google.com'
      )
    } catch {
      base.historicalGoogleCandidateExists = false
      base.historicalProviderStillGoogleLinked = false
    }

    if (!uid) return base

    try {
      const user = await auth.getUser(uid)
      base.currentFirebaseRecordValid = true
      base.currentDisabled = Boolean(user.disabled)
      base.currentProviderType = mapProviderIds((user.providerData ?? []).map((p) => p.providerId))
    } catch {
      base.currentFirebaseRecordValid = false
      base.currentProviderType = 'NONE'
    }

    try {
      const { getAdminFirestore } = await import('@/lib/firebase/admin')
      const snap = await getAdminFirestore().collection('users').doc(uid).get()
      base.currentProfileExists = snap.exists
      const data = snap.exists ? (snap.data() as Record<string, unknown>) : null
      base.currentTermsAccepted = Boolean(data && data.termsAcceptedAt)
    } catch {
      base.currentProfileExists = null
      base.currentTermsAccepted = null
    }
  } catch {
    // Admin unavailable — exact match booleans above remain authoritative.
  }

  return base
}
