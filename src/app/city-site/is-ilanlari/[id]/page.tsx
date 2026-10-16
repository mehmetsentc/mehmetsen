import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CityJobDetail } from '@/components/city/CityJobDetail'
import { getActiveTenant } from '@/lib/tenantContext'
import { loadCityJobDetail } from '@/services/jobDetailPage.server'
import { buildJobPostingJsonLd, cityServicesSchemaLive, jsonLdString } from '@/lib/seo/cityServicesJsonLd'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const tenant = await getActiveTenant()
  if (!tenant) return {}
  const detail = await loadCityJobDetail(tenant.provinceSlug, id)
  if (!detail) return {}
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  return {
    title: detail.employer ? `${detail.title} · ${detail.employer}` : detail.title,
    description: `${detail.cityName} iş ilanı: ${detail.title}. Başvuru ${detail.sourceLabel} üzerinden. ${siteName}`,
  }
}

export default async function CityJobDetailPage({ params }: Props) {
  const { id } = await params
  const tenant = await getActiveTenant()
  if (!tenant) notFound()

  const detail = await loadCityJobDetail(tenant.provinceSlug, id)
  if (!detail) notFound()

  const jsonLd =
    cityServicesSchemaLive() && detail.schema
      ? buildJobPostingJsonLd({
          id: detail.id,
          title: detail.title,
          employer: detail.employer,
          summary: detail.summary,
          place: detail.place,
          cityName: detail.cityName,
          ...detail.schema,
        })
      : null

  return (
    <>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      ) : null}
      <CityJobDetail detail={detail} />
    </>
  )
}
