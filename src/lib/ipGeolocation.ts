export interface IpLocationResult {
  citySlug: string
  cityName: string
  lat: number | null
  lng: number | null
  source: 'ip'
}

/** Client-side fetch of province from edge IP headers via /api/geo/ip. */
export async function fetchIpLocation(): Promise<IpLocationResult | null> {
  try {
    const res = await fetch('/api/geo/ip')
    if (!res.ok) return null
    return (await res.json()) as IpLocationResult
  } catch {
    return null
  }
}
