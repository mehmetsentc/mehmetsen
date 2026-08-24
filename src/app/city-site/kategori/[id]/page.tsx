import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getActiveTenant } from '@/lib/tenantContext'
import { resolveCityCategoryRoute } from '@/lib/cityCategoryRoute'
import { getCityCategoryFeedInitialData } from '@/services/cityNewsService.server'
import { CityFeedPageClient } from '@/components/city/CityFeedPageClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const resolved = resolveCityCategoryRoute(id)
  if (!resolved) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  const cityOrigin = `https://${tenant.slug}.nahaber.com`
  const ogImage = 'https://www.nahaber.com/brand/og-default.png'

  return {
    title: `${cityName} ${resolved.label} Haberleri`,
    description: `${cityName} ${resolved.label.toLowerCase()} haberleri. ${siteName}'de ${cityName} gündemini takip edin.`,
    alternates: { canonical: `${cityOrigin}/kategori/${id}` },
    openGraph: {
      title: `${cityName} ${resolved.label} Haberleri | ${siteName}`,
      description: `${cityName} ${resolved.label.toLowerCase()} haberleri. ${siteName}'de ${cityName} gündemini takip edin.`,
      url: `${cityOrigin}/kategori/${id}`,
      type: 'website',
      locale: 'tr_TR',
      siteName,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${cityName} ${resolved.label}` }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@nahabercom',
      title: `${cityName} ${resolved.label} Haberleri | ${siteName}`,
      images: [ogImage],
    },
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
      streamSectionLabel={resolved.label}
      streamSectionHref={ROUTES.CATEGORY(resolved.categoryId)}
    />
  )
}
