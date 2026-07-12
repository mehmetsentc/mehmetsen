import { getAdminFirestore } from '@/lib/firebase/admin'

const NOSYAPI_KEY = process.env.NOSYAPI_KEY?.trim()
const NOSYAPI_BASE = 'https://www.nosyapi.com/apiv2/service'
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 gün
const CACHE_COLLECTION = 'museumCache'

export interface Museum {
  id: number
  name: string
  description: string
  address: string
  workingTime: string
  details: string
  latitude: string
  longitude: string
  phone: string
  email: string
  website: string
  city: string
  district: string
}

export interface MuseumCity {
  cities: string
  slug: string
}

interface NosyApiResponse<T> {
  status: string
  message: string
  messageTR: string
  data: T
}

async function nosyFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  if (!NOSYAPI_KEY) throw new Error('NOSYAPI_KEY env var tanımlanmamış')
  const url = new URL(`${NOSYAPI_BASE}/${endpoint}`)
  url.searchParams.set('apiKey', NOSYAPI_KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'nahaber.com/1.0 (contact: mehmetsentc@gmail.com)' },
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`NosyAPI ${endpoint} → HTTP ${res.status}`)
  const json: NosyApiResponse<T> = await res.json()
  if (json.status !== 'success') throw new Error(`NosyAPI hata: ${json.messageTR ?? json.message}`)
  return json.data
}

export async function getCities(): Promise<MuseumCity[]> {
  const db = getAdminFirestore()
  const ref = db.collection(CACHE_COLLECTION).doc('cities')
  const doc = await ref.get()
  if (doc.exists) {
    const data = doc.data() as { cities: MuseumCity[]; cachedAt: number }
    if (Date.now() - data.cachedAt < CACHE_TTL_MS) return data.cities
  }
  const cities = await nosyFetch<MuseumCity[]>('museum/cities')
  await ref.set({ cities, cachedAt: Date.now() })
  return cities
}

export async function getMuseumsByCity(citySlug: string): Promise<Museum[]> {
  if (!citySlug) return []
  const db = getAdminFirestore()
  const docId = `city-${citySlug}`
  const ref = db.collection(CACHE_COLLECTION).doc(docId)
  const doc = await ref.get()
  if (doc.exists) {
    const data = doc.data() as { museums: Museum[]; cachedAt: number }
    if (Date.now() - data.cachedAt < CACHE_TTL_MS) return data.museums
  }
  const museums = await nosyFetch<Museum[]>('museum', { city: citySlug })
  await ref.set({ museums, cachedAt: Date.now() })
  return museums
}
