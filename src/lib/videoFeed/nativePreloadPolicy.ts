import type { NetworkTier } from '@/hooks/useNetworkStatus'

export type NativePreloadRole = 'current' | 'next' | 'nextPlus1' | 'previous' | 'other'

export type NativeMediaPolicy = {
  preload: 'none' | 'metadata' | 'auto'
  attachSrc: boolean
  warmupBytes: number
  posterFetchPriority: 'high' | 'low'
}

/** First-GOP warmup for the next owned MP4. Not a full-file download. */
export const NATIVE_NEXT_WARMUP_MAX_BYTES = 512 * 1024

export function nativePreloadRoleFor(index: number, activeIndex: number): NativePreloadRole {
  if (index === activeIndex) return 'current'
  if (index === activeIndex + 1) return 'next'
  if (index === activeIndex + 2) return 'nextPlus1'
  if (index === activeIndex - 1) return 'previous'
  return 'other'
}

/**
 * Role × existing NetworkTier. Reuses high/medium/low; does not invent a second network system.
 * Current stays auto even on low once selected. Next never uses preload=auto (avoids full-file contention).
 */
export function nativeMediaPolicyFor(
  role: NativePreloadRole,
  tier: NetworkTier
): NativeMediaPolicy {
  if (role === 'current') {
    return {
      preload: 'auto',
      attachSrc: true,
      warmupBytes: 0,
      posterFetchPriority: 'high',
    }
  }

  if (role === 'next') {
    const constrained = tier === 'low'
    return {
      preload: 'metadata',
      attachSrc: true,
      warmupBytes: constrained ? 0 : NATIVE_NEXT_WARMUP_MAX_BYTES,
      posterFetchPriority: 'low',
    }
  }

  if (role === 'previous') {
    const allowLive = tier === 'high'
    return {
      preload: 'metadata',
      attachSrc: allowLive,
      warmupBytes: 0,
      posterFetchPriority: 'low',
    }
  }

  if (role === 'nextPlus1') {
    return {
      preload: 'none',
      attachSrc: false,
      warmupBytes: 0,
      posterFetchPriority: 'low',
    }
  }

  return {
    preload: 'none',
    attachSrc: false,
    warmupBytes: 0,
    posterFetchPriority: 'low',
  }
}

export function isStaleGeneration(started: number, current: number): boolean {
  return started !== current
}

export function abortDetachedNativeVideo(
  el: { removeAttribute: (name: string) => void; load: () => void; getAttribute?: (name: string) => string | null } | null
): boolean {
  if (!el) return false
  const hasSrc = typeof el.getAttribute === 'function' ? Boolean(el.getAttribute('src')) : true
  if (!hasSrc) return false
  el.removeAttribute('src')
  el.load()
  return true
}

export async function warmupOwnedNativeMedia(
  url: string,
  opts: {
    signal: AbortSignal
    generation: number
    currentGeneration: () => number
    fetchImpl?: typeof fetch
    maxBytes?: number
  }
): Promise<'ok' | 'aborted' | 'stale' | 'failed'> {
  if (opts.signal.aborted) return 'aborted'
  if (isStaleGeneration(opts.generation, opts.currentGeneration())) return 'stale'

  const maxBytes = opts.maxBytes ?? NATIVE_NEXT_WARMUP_MAX_BYTES
  const fetchImpl = opts.fetchImpl ?? fetch

  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { Range: `bytes=0-${Math.max(0, maxBytes - 1)}` },
      signal: opts.signal,
      mode: 'cors',
      credentials: 'omit',
    })
    if (opts.signal.aborted) return 'aborted'
    if (isStaleGeneration(opts.generation, opts.currentGeneration())) return 'stale'
    await res.arrayBuffer().catch(() => undefined)
    if (opts.signal.aborted) return 'aborted'
    if (isStaleGeneration(opts.generation, opts.currentGeneration())) return 'stale'
    return 'ok'
  } catch (err) {
    if (opts.signal.aborted) return 'aborted'
    if (err instanceof DOMException && err.name === 'AbortError') return 'aborted'
    if (err instanceof Error && /abort/i.test(err.name)) return 'aborted'
    return 'failed'
  }
}
