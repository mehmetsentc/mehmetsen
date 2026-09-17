import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getCitySlugFromHeaders } from '@/lib/cityHost'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) {
    return {
      title: 'Spor Haberleri',
      description: 'Futbol, basketbol, voleybol ve tüm spor haberleri.',
    }
  }

  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} Spor Haberleri`,
    description: `${cityName} spor haberleri, yerel spor gelişmeleri ve maç sonuçları. ${siteName}'de ${cityName} sporunu takip edin.`,
  }
}

export default async function SporPage() {
  const citySlug = await getCitySlugFromHeaders()

  if (!citySlug) {
    redirect(ROUTES.SPOR)
  }

  redirect('/?category=spor')
}
