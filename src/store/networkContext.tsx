'use client'

import { createContext, useContext, type ReactNode } from 'react'
import {
  useNetworkStatus,
  type NetworkStatus,
  type NetworkTier,
} from '@/hooks/useNetworkStatus'

const FALLBACK_STATUS: NetworkStatus = {
  effectiveType: null,
  downlink: null,
  saveData: false,
  tier: 'high',
  supported: false,
}

const NetworkContext = createContext<NetworkStatus | undefined>(undefined)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const status = useNetworkStatus()
  return <NetworkContext.Provider value={status}>{children}</NetworkContext.Provider>
}

/**
 * Reads the shared network status. Safe to call outside a provider — falls back
 * to a 'high' tier default so components never crash if rendered standalone.
 */
export function useNetwork(): NetworkStatus {
  return useContext(NetworkContext) ?? FALLBACK_STATUS
}

export function useNetworkTier(): NetworkTier {
  return useNetwork().tier
}

/** next/image `quality` per tier. Lower quality on constrained networks. */
export function imageQualityForTier(tier: NetworkTier): number {
  switch (tier) {
    case 'low':
      return 50
    case 'medium':
      return 65
    default:
      return 80
  }
}

/**
 * Scales a `sizes` hint down on slow networks so the browser requests a
 * smaller candidate from the next/image srcset. `base` is the high-tier sizes
 * string; for low tier we ask for roughly half-resolution candidates.
 */
export function scaleSizesForTier(base: string, tier: NetworkTier): string {
  if (tier === 'low') return `(max-width: 768px) 60vw, ${base}`
  return base
}

/** Video preload strategy for an item given its active state and the tier. */
export function videoPreloadForTier(
  tier: NetworkTier,
  isActive: boolean
): 'none' | 'metadata' | 'auto' {
  if (isActive) {
    // Active item: full buffer on fast links, metadata-only when constrained.
    return tier === 'low' ? 'metadata' : 'auto'
  }
  // Offscreen items: never prefetch on slow links; metadata otherwise.
  return tier === 'high' ? 'metadata' : 'none'
}
