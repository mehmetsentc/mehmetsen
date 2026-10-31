'use client'

import { DesktopPortalPulse } from '@/components/home/desktop/DesktopPortalPulse'
import { EditorialFrontPage, type EditorialSection } from '@/components/home/desktop/EditorialFrontPage'
import { CityCinemaEventsStrip } from '@/components/city/CityCinemaEventsStrip'
import { CityNewspaperServiceCards } from '@/components/city/CityNewspaperServiceCards'
import { useCityTenant } from '@/store/cityTenantContext'
import { ROUTES } from '@/constants/routes'
import type { NaEvent } from '@/types/event'
import type { NewsItem } from '@/types/newsItem'

function categoryHref(id: string) {
  if (id === 'yerel') return ROUTES.CATEGORY('yerel-haber')
  if (id === 'asayis') return ROUTES.CATEGORY('asayis')
  return ROUTES.CATEGORY(id)
}

/**
 * National desktop front page. Layout lives in EditorialFrontPage (shared
 * with city homes); this wrapper only maps the home-feed allocation into
 * editorial sections. The newsletter signup lives once, in the footer.
 */
export function DesktopPortalHome({
  heroSlides,
  mansetItems,
  columnists,
  mostRead,
  categoryCards,
  videoItem,
  photoItems: _photoItems,
  gundemItems = [],
  yerelItems = [],
  thirdPageItems = [],
  videoItems = [],
  kulturItems = [],
  saglikItems = [],
  turizmItems = [],
  yasamItems = [],
  magazinItems = [],
  egitimItems = [],
  cinemaEvents = [],
  cityName,
}: {
  heroSlides: NewsItem[]
  mansetItems: NewsItem[]
  columnists: NewsItem[]
  mostRead: NewsItem[]
  categoryCards: { id: string; title: string; items: NewsItem[] }[]
  videoItem: NewsItem | null
  photoItems: NewsItem[]
  gundemItems?: NewsItem[]
  yerelItems?: NewsItem[]
  thirdPageItems?: NewsItem[]
  videoItems?: NewsItem[]
  kulturItems?: NewsItem[]
  saglikItems?: NewsItem[]
  turizmItems?: NewsItem[]
  yasamItems?: NewsItem[]
  magazinItems?: NewsItem[]
  egitimItems?: NewsItem[]
  cinemaEvents?: NaEvent[]
  cityName?: string
}) {
  const cityTenant = useCityTenant()
  const citySlug = cityTenant?.provinceSlug

  const sections: EditorialSection[] = [
    { id: 'gundem', title: 'Gündem', items: gundemItems },
    ...categoryCards,
    { id: 'asayis', title: '3. Sayfa', items: thirdPageItems },
    { id: 'kultur', title: 'Kültür', items: kulturItems },
    { id: 'saglik', title: 'Sağlık', items: saglikItems },
    { id: 'yasam', title: 'Yaşam', items: yasamItems },
    { id: 'turizm', title: 'Turizm', items: turizmItems },
    { id: 'egitim', title: 'Eğitim', items: egitimItems },
    { id: 'magazin', title: 'Magazin', items: magazinItems },
  ]
    .filter((section, index, all) => all.findIndex((s) => s.id === section.id) === index)
    .map((section) => ({ ...section, href: categoryHref(section.id) }))

  const local: EditorialSection | null =
    !citySlug && yerelItems.length > 0
      ? { id: 'yerel', title: 'Yerel haberler', href: categoryHref('yerel'), items: yerelItems }
      : null

  return (
    <EditorialFrontPage
      leadPool={[...heroSlides, ...mansetItems, ...gundemItems]}
      mostRead={mostRead}
      columnists={columnists}
      sections={sections}
      local={local}
      videos={videoItems.length > 0 ? videoItems : videoItem ? [videoItem] : []}
      videoHref={ROUTES.VIDEO}
      railExtra={citySlug ? null : <DesktopPortalPulse layout="rail" />}
      afterLead={
        citySlug ? (
          <CityNewspaperServiceCards citySlug={citySlug} cityName={cityName || cityTenant.displayName} />
        ) : null
      }
      afterSections={
        cinemaEvents.length > 0 ? (
          <CityCinemaEventsStrip events={cinemaEvents} cityName={cityName} variant="newspaper" />
        ) : null
      }
    />
  )
}
