/**
 * Per-city ops settings (SEO / feed / push / ads / SMM links).
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { CityOpsSettings } from '@/types/newsroomOs'

function col() {
  return getAdminDb().collection(Collections.CITY_OPS_SETTINGS)
}

function getAdminDb() {
  return getAdminFirestore()
}

export function defaultCityOps(citySlug: string): CityOpsSettings {
  return {
    citySlug,
    active: true,
    localEditorHumanId: null,
    localAiEditorId: null,
    smmAgentId: `smm-${citySlug}`,
    seoTitle: null,
    seoDescription: null,
    feedEnabled: true,
    pushSegment: `city:${citySlug}`,
    adSlotIds: [],
    socialAccountIds: [],
    matrixRules: [
      { match: { citySlug, categoryId: 'yerel-haber' }, priority: 'HIGH' },
      { match: { citySlug }, priority: 'HIGH' },
      { match: { categoryId: 'gundem' }, priority: 'MEDIUM' },
      { match: { categoryId: 'dunya' }, priority: 'LOW' },
      { match: { isBreaking: true }, priority: 'HIGH' },
    ],
    updatedAt: Date.now(),
    updatedBy: null,
  }
}

export async function getCityOpsSettings(citySlug: string): Promise<CityOpsSettings> {
  const snap = await col().doc(citySlug).get()
  if (!snap.exists) return defaultCityOps(citySlug)
  return { ...defaultCityOps(citySlug), ...(snap.data() as CityOpsSettings), citySlug }
}

export async function upsertCityOpsSettings(
  citySlug: string,
  patch: Partial<CityOpsSettings>,
  updatedBy?: string | null
): Promise<CityOpsSettings> {
  const current = await getCityOpsSettings(citySlug)
  const next: CityOpsSettings = {
    ...current,
    ...patch,
    citySlug,
    updatedAt: Date.now(),
    updatedBy: updatedBy ?? current.updatedBy ?? null,
  }
  await col().doc(citySlug).set(next, { merge: true })
  return next
}

export async function listCityOpsSettings(limit = 100): Promise<CityOpsSettings[]> {
  const snap = await col().limit(Math.min(limit, 200)).get()
  return snap.docs.map((d) => ({ ...defaultCityOps(d.id), ...(d.data() as CityOpsSettings), citySlug: d.id }))
}
