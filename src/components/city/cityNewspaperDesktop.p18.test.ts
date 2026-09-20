import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('city desktop newspaper split', () => {
  it('city home keeps the newspaper header lockup on the city layout', () => {
    const home = read('src/app/(main)/page.tsx')
    const citySite = read('src/app/city-site/page.tsx')
    const header = read('src/components/city/CityDesktopNewspaperHeader.tsx')
    expect(home).toContain('CityAdaptiveHome')
    expect(citySite).toContain('CityAdaptiveHome')
    expect(header).toContain('CityBrandLockup')
    expect(header).toContain('withCityTenantHref')
  })

  it('keeps localhost category links on the city tenant', () => {
    const nav = read('src/lib/cityNewspaperNav.ts')
    expect(nav).toContain('withCityTenantHref')
    expect(nav).toContain('tenant')
    const header = read('src/components/city/CityDesktopNewspaperHeader.tsx')
    expect(header).toContain('withCityTenantHref')
    expect(header).toContain('city-masthead-lockup')
  })

  it('uses the live city newspaper header and hides mobile chrome on desktop', () => {
    const layout = read('src/components/city/CityLayoutClient.tsx')
    expect(layout).toContain('CityDesktopNewspaperHeader')
    expect(layout).toMatch(/lg:hidden[\s\S]{0,80}CityNavbar/)
    expect(layout).toContain('data-city-desktop="1"')
    expect(layout).toContain('content-stage-newspaper')
  })

  it('puts weather after the hero and events at the end of the newspaper, not the top', () => {
    const portal = read('src/components/home/desktop/DesktopPortalHome.tsx')
    const header = read('src/components/city/CityDesktopNewspaperHeader.tsx')
    const cinema = read('src/components/city/CityCinemaEventsStrip.tsx')
    const weatherAt = portal.indexOf('<CityNewspaperServiceCards')
    const firstGridAt = portal.indexOf('{packed.gridCards.length > 0')
    const eventsAt = portal.indexOf('variant="newspaper"')
    const newsletterAt = portal.lastIndexOf('Haber bülteni')
    expect(weatherAt).toBeGreaterThan(-1)
    expect(firstGridAt).toBeGreaterThan(weatherAt)
    expect(eventsAt).toBeGreaterThan(firstGridAt)
    expect(newsletterAt).toBeGreaterThan(eventsAt)
    expect(portal).not.toContain('Foto galeri')
    expect(header).toContain('city-masthead-lockup')
    expect(header).not.toContain('showDotCom')
    expect(cinema).toContain('lg:hidden')
  })
})
