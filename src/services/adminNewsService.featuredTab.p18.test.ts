import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('CMS Genelde öne çıkan tab', () => {
  it('lists featured pins without createdAt pagination dropping older stars', () => {
    const service = read('src/services/adminNewsService.ts')
    expect(service).toContain("filter === 'featured'")
    expect(service).toContain('pinTab && !limitOverride ? 500')
    expect(service).toContain('No orderBy — missing featuredAt/createdAt must not drop a just-pinned story.')
    expect(service).toContain('featured: data.featured === true')
    expect(service).toContain('featuredAtMs')

    const page = read('src/app/admin/news/page.tsx')
    expect(page).toContain("filter === 'featured'")
    expect(page).toContain("filter === 'local-featured'")
  })
})
