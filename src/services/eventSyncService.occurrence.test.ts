import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('occurrence writer isolation', () => {
  it('keeps upsertOccurrencesOnly free of markRemoved / markPast / meta writes', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/services/eventSyncService.ts'), 'utf8')
    const upsert = source.slice(
      source.indexOf('async upsertOccurrencesOnly'),
      source.indexOf('async syncEvents')
    )
    expect(upsert).toMatch(/markedPast: 0/)
    expect(upsert).toMatch(/markedRemoved: 0/)
    expect(upsert).toMatch(/wroteMeta: false/)
    expect(upsert).not.toMatch(/markRemovedEvents/)
    expect(upsert).not.toMatch(/markPastEvents/)
    expect(upsert).not.toMatch(/META_DOC_PATH/)
    expect(upsert).toMatch(/filterOccurrenceWriteEligible/)
  })
})
