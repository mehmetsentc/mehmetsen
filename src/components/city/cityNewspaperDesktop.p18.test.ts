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
    expect(home).toContain('NationalHomePage')
    expect(home).not.toContain('getCitySlugFromHeaders')
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

  it('city home uses the shared editorial template: lead, then services/events, then sections', () => {
    const rsc = read('src/components/city/CityDesktopNewspaperRsc.tsx')
    const editorial = read('src/components/home/desktop/EditorialFrontPage.tsx')
    const header = read('src/components/city/CityDesktopNewspaperHeader.tsx')
    const cinema = read('src/components/city/CityCinemaEventsStrip.tsx')
    expect(rsc).toContain('EditorialFrontPage')
    expect(rsc).toContain('<CityNewspaperServiceCards')
    expect(rsc).toContain('<CityNewspaperEventsRail')
    // Newsletter lives once, in the city footer.
    expect(rsc).not.toContain('desktop-portal-nl')
    const leadAt = editorial.indexOf('<EdLeadBand lead={lead}')
    const afterLeadAt = editorial.indexOf('{afterLead}')
    const sectionsAt = editorial.indexOf('<EdSectionBlock')
    expect(leadAt).toBeGreaterThan(-1)
    expect(afterLeadAt).toBeGreaterThan(leadAt)
    expect(sectionsAt).toBeGreaterThan(afterLeadAt)
    expect(rsc).not.toContain('Foto galeri')
    expect(header).toContain('city-masthead-lockup')
    expect(header).not.toContain('showDotCom')
    expect(cinema).toContain('lg:hidden')
  })
})
