export const DISCOVERY_LANES = ['RSS', 'CRAWLER', 'LEGACY_ADAPTER', 'MANUAL'] as const
export type DiscoveryLane = (typeof DISCOVERY_LANES)[number]

export function mergeDiscoveryLanes(
  existing: string[] | null | undefined,
  lane: DiscoveryLane
): DiscoveryLane[] {
  const next: DiscoveryLane[] = []
  for (const value of [...(existing || []), lane]) {
    if (DISCOVERY_LANES.includes(value as DiscoveryLane) && !next.includes(value as DiscoveryLane)) {
      next.push(value as DiscoveryLane)
    }
  }
  return next
}

export function laneFromDiscoveryType(
  discoveryType: 'RSS' | 'ATOM' | 'SITEMAP' | 'LISTING' | 'MANUAL',
  explicit?: DiscoveryLane
): DiscoveryLane {
  if (explicit) return explicit
  if (discoveryType === 'MANUAL') return 'MANUAL'
  if (discoveryType === 'RSS' || discoveryType === 'ATOM') return 'RSS'
  return 'CRAWLER'
}
