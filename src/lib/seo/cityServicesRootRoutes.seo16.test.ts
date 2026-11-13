import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// SEO-16: city hosts are served by the ROOT routes (live HTML on 30 Oct came from
// app/nobetci-eczaneler/page), so the CITY-SERVICES-1 JSON-LD must be emitted there.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('SEO-16 city service structured data on the routes that actually render', () => {
  it.each([
    ['src/app/nobetci-eczaneler/page.tsx', 'buildDutyPharmacyItemListJsonLd'],
    ['src/app/etkinlik/[id]/page.tsx', 'buildCityEventJsonLd'],
    ['src/app/is-ilanlari/[id]/page.tsx', 'buildJobPostingJsonLd'],
  ])('%s emits %s behind the schema gate', (file, builder) => {
    const src = read(file)
    expect(src).toContain(builder)
    expect(src).toContain('cityServicesSchemaLive()')
    expect(src).toContain('type="application/ld+json"')
  })
})
