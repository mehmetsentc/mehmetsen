import { CityNewspaperEventsRail } from '@/components/city/CityNewspaperEventsRail'
import { CityNewspaperFooter } from '@/components/city/CityNewspaperFooter'
import { CityNewspaperServiceCards } from '@/components/city/CityNewspaperServiceCards'
import { EditorialFrontPage } from '@/components/home/desktop/EditorialFrontPage'
import { buildCityPortalHomeProps } from '@/lib/cityPortalHome'
import type { NaEvent } from '@/types/event'
import type { HomeFeedInitialData } from '@/types/newsItem'

/**
 * City desktop front page — same editorial template, grid and light paper as
 * nahaber.com; only content and the city lockup differ. The newsletter form
 * lives once, in CityNewspaperFooter.
 */
export function CityDesktopNewspaperRsc({
  cityName,
  citySlug,
  data,
  events = [],
}: {
  cityName: string
  citySlug: string
  data: HomeFeedInitialData
  events?: NaEvent[]
}) {
  const portal = buildCityPortalHomeProps(data)

  return (
    <div className="city-desktop-newspaper-page w-full" data-city-portal="1">
      <h1 className="sr-only">{cityName} Haberleri — NaHaber</h1>

      <EditorialFrontPage
        leadPool={[...portal.heroSlides, ...portal.mansetItems]}
        mostRead={portal.mostRead}
        columnists={portal.columnists}
        sections={portal.categoryCards}
        videos={portal.videoItems}
        videoHref="/kategori/video"
        afterLead={
          <>
            <CityNewspaperServiceCards citySlug={citySlug} cityName={cityName} />
            <CityNewspaperEventsRail cityName={cityName} events={events} />
          </>
        }
      />

      <CityNewspaperFooter cityName={cityName} />
    </div>
  )
}
