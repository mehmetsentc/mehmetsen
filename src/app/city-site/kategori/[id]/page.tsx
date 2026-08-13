import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DEFAULT_CATEGORIES, getNationalCategoryForYerelSubcategory } from '@/constants/config'
import { CITY_CATEGORY_CHIPS } from '@/constants/cityCategories'
import { getCityCategoryName } from '@/constants/cities'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryFeedInitialData } from '@/services/cityNewsService.server'
import { CityFeedPageClient } from '@/components/city/CityFeedPageClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Resolve city category route id → query family root + display label.
 * National chips (siyaset) query their home-feed family (incl. yerel-siyaset).
 * Yerel-only chips (yerel-duyuru) and explicit yerel-* URLs stay as-is.
 */
function resolveCityCategoryRoute(id: string): { categoryId: string; label: string } | null {
  const raw = id.trim().toLowerCase()
  if (!raw) return null

  const chip = CITY_CATEGORY_CHIPS.find(
    (c) => c.categoryId === raw || (c.id === raw && c.categoryId)
  )
  if (chip?.categoryId) {
    return { categoryId: chip.categoryId, label: chip.label }
  }

  const def = DEFAULT_CATEGORIES.find((c) => c.slug === raw || c.id === raw)
  if (!def) return null

  // /kategori/yerel-siyaset → show under national Siyaset family on city sites
  const national = getNationalCategoryForYerelSubcategory(def.id)
  if (national) {
    const nationalChip = CITY_CATEGORY_CHIPS.find((c) => c.categoryId === national)
    const nationalDef = DEFAULT_CATEGORIES.find((c) => c.id === national)
    return {
      categoryId: national,
      label: nationalChip?.label ?? nationalDef?.name ?? def.name,
    }
  }

  return { categoryId: def.id, label: def.name }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const resolved = resolveCityCategoryRoute(id)
  if (!resolved) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} ${resolved.label} Haberleri`,
    description: `${cityName} ${resolved.label.toLowerCase()} haberleri. ${siteName}'de ${cityName} gündemini takip edin.`,
  }
}

export default async function CityCategoryPage({ params }: PageProps) {
  const { id } = await params
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const resolved = resolveCityCategoryRoute(id)
  if (!resolved) notFound()

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const homeFeedData = await getCityCategoryFeedInitialData(
    tenant.provinceSlug,
    resolved.categoryId
  )
  const sectionTitle = `${cityName} ${resolved.label} Haberleri`

  return (
    <CityFeedPageClient
      homeFeedData={homeFeedData}
      cityName={cityName}
      sectionTitle={sectionTitle}
    />
  )
}
