export interface DomainPoliteness {
  lastRequestAt: number
  intervalMs: number
  cooldownUntil: number
}

const domains = new Map<string, DomainPoliteness>()

export function getDomainKey(hostname: string): string {
  return hostname.toLowerCase()
}

export function getPoliteness(hostname: string, minIntervalMs: number): DomainPoliteness {
  const key = getDomainKey(hostname)
  const existing = domains.get(key)
  if (existing) {
    existing.intervalMs = Math.max(existing.intervalMs, minIntervalMs)
    return existing
  }
  const created: DomainPoliteness = {
    lastRequestAt: 0,
    intervalMs: minIntervalMs,
    cooldownUntil: 0,
  }
  domains.set(key, created)
  return created
}

export async function waitForDomainSlot(hostname: string, minIntervalMs: number): Promise<void> {
  const state = getPoliteness(hostname, minIntervalMs)
  const now = Date.now()
  const waitUntil = Math.max(state.cooldownUntil, state.lastRequestAt + state.intervalMs)
  const delay = waitUntil - now
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  state.lastRequestAt = Date.now()
}

export function noteHttpStatus(hostname: string, status: number, minIntervalMs: number): void {
  const state = getPoliteness(hostname, minIntervalMs)
  if (status === 429) {
    state.intervalMs = Math.min(state.intervalMs * 2, 60_000)
    state.cooldownUntil = Date.now() + state.intervalMs
    return
  }
  if (status >= 500) {
    state.intervalMs = Math.min(state.intervalMs * 2, 60_000)
    state.cooldownUntil = Date.now() + Math.min(state.intervalMs, 15_000)
  }
}

export function resetPolitenessForTests(): void {
  domains.clear()
}

export function computeNextDiscoveryAt(
  crawlIntervalSeconds: number,
  consecutiveFailures: number,
  discoveredCount: number,
  now = new Date()
): Date {
  let interval = Math.max(30, crawlIntervalSeconds)
  if (consecutiveFailures > 0) {
    interval = Math.min(interval * 2 ** Math.min(consecutiveFailures, 5), 6 * 3600)
  } else if (discoveredCount === 0) {
    interval = Math.min(Math.round(interval * 1.25), 3600)
  } else if (discoveredCount >= 10) {
    interval = Math.max(30, Math.round(interval * 0.75))
  }
  return new Date(now.getTime() + interval * 1000)
}

export function shouldRetryStatus(status: number): boolean {
  if (status === 404 || status === 410) return false
  if (status === 401 || status === 403 || status === 451) return false
  return status >= 500 || status === 429 || status === 408
}
