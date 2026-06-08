'use client'

import { useEffect, useState } from 'react'

export type EffectiveConnectionType = '4g' | '3g' | '2g' | 'slow-2g'
export type NetworkTier = 'high' | 'medium' | 'low'

export interface NetworkStatus {
  /** Raw effectiveType reported by the Network Information API, if available. */
  effectiveType: EffectiveConnectionType | null
  /** Estimated downlink bandwidth in Mbps, if available. */
  downlink: number | null
  /** Whether the user requested reduced data usage. */
  saveData: boolean
  /** Derived quality tier used to drive adaptive media loading. */
  tier: NetworkTier
  /** True when the Network Information API is available in this browser. */
  supported: boolean
}

interface NetworkInformationLike extends EventTarget {
  effectiveType?: EffectiveConnectionType
  downlink?: number
  saveData?: boolean
  addEventListener: (type: 'change', listener: () => void) => void
  removeEventListener: (type: 'change', listener: () => void) => void
}

function getConnection(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike
    mozConnection?: NetworkInformationLike
    webkitConnection?: NetworkInformationLike
  }
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null
}

export function deriveTier(
  effectiveType: EffectiveConnectionType | null,
  saveData: boolean
): NetworkTier {
  if (saveData) return 'low'
  switch (effectiveType) {
    case 'slow-2g':
    case '2g':
      return 'low'
    case '3g':
      return 'medium'
    case '4g':
      return 'high'
    default:
      // API unavailable / unknown → assume a capable connection.
      return 'high'
  }
}

function readStatus(): NetworkStatus {
  const connection = getConnection()
  if (!connection) {
    return {
      effectiveType: null,
      downlink: null,
      saveData: false,
      tier: 'high',
      supported: false,
    }
  }

  const effectiveType = connection.effectiveType ?? null
  const saveData = Boolean(connection.saveData)

  return {
    effectiveType,
    downlink: typeof connection.downlink === 'number' ? connection.downlink : null,
    saveData,
    tier: deriveTier(effectiveType, saveData),
    supported: true,
  }
}

// Sensible SSR / first-paint default: assume a capable connection so we don't
// degrade quality for users who actually have fast networks.
const DEFAULT_STATUS: NetworkStatus = {
  effectiveType: null,
  downlink: null,
  saveData: false,
  tier: 'high',
  supported: false,
}

/**
 * Tracks the device connection quality via the Network Information API and
 * derives a coarse `tier` ('high' | 'medium' | 'low') for adaptive media
 * loading. SSR-safe: returns a 'high' default until mounted on the client.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(DEFAULT_STATUS)

  useEffect(() => {
    const connection = getConnection()
    setStatus(readStatus())

    if (!connection) return

    const handleChange = () => setStatus(readStatus())
    connection.addEventListener('change', handleChange)
    return () => connection.removeEventListener('change', handleChange)
  }, [])

  return status
}
