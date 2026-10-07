import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getCategoryAdSlotIds, getHomeAdSlotIds } from '@/constants/adSlots'
import { docToAdBanner, pickBestBannerForSlot, toPublicAdBanner, type AdGeoContext } from '@/lib/adBannerUtils'
import { getDistrictsForProvince, isTurkishProvinceSlug } from '@/constants/cities'
import type { AdBannerPublic } from '@/types/adBanner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = searchParams.get('page')
  const categoryId = searchParams.get('categoryId')
  const slotsParam = searchParams.get('slots')
  // Phase 2: local pages pass their il (and ilçe) so il/ilçe ads can match.
  const citySlug = searchParams.get('citySlug')?.trim().toLowerCase() || ''
  const districtSlug = searchParams.get('districtSlug')?.trim().toLowerCase() || ''
  const geo: AdGeoContext = {}
  if (citySlug && isTurkishProvinceSlug(citySlug)) {
    geo.citySlug = citySlug
    if (districtSlug && getDistrictsForProvince(citySlug).some((d) => d.slug === districtSlug)) {
      geo.districtSlug = districtSlug
    }
  }

  let slotIds: string[] = []
  if (slotsParam) {
    slotIds = slotsParam.split(',').map((s) => s.trim()).filter(Boolean)
  } else if (page === 'home') {
    slotIds = getHomeAdSlotIds()
  } else if (page === 'category' && categoryId) {
    slotIds = getCategoryAdSlotIds(categoryId)
  } else {
    return NextResponse.json({ error: 'page veya slots gerekli' }, { status: 400 })
  }

  try {
    const db = getAdminFirestore()
    const snap = await db.collection(Collections.AD_BANNERS).where('active', '==', true).get()
    const all = snap.docs.map((d) => docToAdBanner(d.id, d.data() as Record<string, unknown>))

    const ads: Record<string, AdBannerPublic | null> = {}
    for (const slotId of slotIds) {
      const best = pickBestBannerForSlot(all, slotId, geo)
      ads[slotId] = best ? toPublicAdBanner(best) : null
    }

    return NextResponse.json(
      { ads },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    )
  } catch (err) {
    console.error('[api/ads]', err)
    return NextResponse.json({ ads: {} })
  }
}
