import { getCityCategoryName } from '@/constants/cities'
import { getCityHomeFeedInitialData } from '@/services/cityNewsService.server'
import { getCityEventsServer } from '@/services/eventService.server'
import { CityDesktopBreakingSync } from '@/components/city/CityDesktopBreakingSync'
import { CityDesktopNewspaperRsc } from '@/components/city/CityDesktopNewspaperRsc'

/**
 * City `/` desktop newspaper. Feed 2 is mounted from CityLayoutClient on
 * mobile only — never imported here — so SmartFeed cannot share this page's
 * webpack graph.
 */
export async function CityAdaptiveHome({
  citySlug,
}: {
  citySlug: string
  category?: string | null
}) {
  const [homeFeedData, events] = await Promise.all([
    getCityHomeFeedInitialData(citySlug),
    getCityEventsServer(citySlug, 'upcoming', 10),
  ])
  const cityName = getCityCategoryName(citySlug)
  const breakingItems =
    homeFeedData.breaking.length > 0 ? homeFeedData.breaking : homeFeedData.latest

  return (
    <div className="hidden lg:block" data-city-desktop-newspaper="1">
      <CityDesktopBreakingSync breakingItems={breakingItems} />
      <CityDesktopNewspaperRsc
        cityName={cityName}
        citySlug={citySlug}
        data={homeFeedData}
        events={events}
      />
    </div>
  )
}
