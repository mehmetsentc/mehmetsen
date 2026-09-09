import { describe, expect, it } from 'vitest'
import { MemoryCrawlerStore } from '@/services/crawler/store/memory'

// P16.3-SCHED-FAIRNESS: listDueSources previously ordered only by `priority DESC`, so among
// equal-priority sources the ordering was effectively arbitrary (Map/row insertion order).
// With maxSourcesPerTick smaller than the fleet size, a source that always landed "after" its
// same-priority peers in that arbitrary order could be starved indefinitely, even though it
// was due and its peers had just been checked. This test proves the fix: within the same
// priority band, the source that has waited longest (or was never checked) is now always
// picked first, so no equal-priority source can be perpetually skipped.

async function makeSource(
  store: MemoryCrawlerStore,
  opts: { name: string; priority: number; nextDiscoveryAt: Date | null }
) {
  const row = await store.insertSource({
    name: opts.name,
    domain: `${opts.name.toLowerCase()}.example.com`,
    baseUrl: `https://${opts.name.toLowerCase()}.example.com`,
    countryCode: 'TR',
    language: 'tr',
    status: 'ACTIVE',
    priority: opts.priority,
  })
  await store.updateSource(row.id, { nextDiscoveryAt: opts.nextDiscoveryAt })
  return row
}

describe('MemoryCrawlerStore.listDueSources fairness', () => {
  it('picks the longest-waiting / never-checked source first within the same priority band', async () => {
    const store = new MemoryCrawlerStore()
    const now = new Date('2026-09-08T12:00:00Z')

    // Same priority (50) for all three, so only the fairness tiebreaker decides order.
    const neverChecked = await makeSource(store, { name: 'NeverChecked', priority: 50, nextDiscoveryAt: null })
    const checkedLongAgo = await makeSource(store, {
      name: 'CheckedLongAgo',
      priority: 50,
      nextDiscoveryAt: new Date(now.getTime() - 10 * 60_000), // due 10 min ago
    })
    const checkedRecently = await makeSource(store, {
      name: 'CheckedRecently',
      priority: 50,
      nextDiscoveryAt: new Date(now.getTime() - 1 * 60_000), // due 1 min ago
    })

    const due = await store.listDueSources(now, 2)

    // Never-checked (null) and the longest-overdue source must win the two available slots;
    // the most-recently-checked equal-priority source must NOT crowd them out.
    expect(due.map((s) => s.id)).toEqual([neverChecked.id, checkedLongAgo.id])
    expect(due.map((s) => s.id)).not.toContain(checkedRecently.id)
  })

  it('still lets a strictly higher priority source win over an older equal-lower-priority one', async () => {
    const store = new MemoryCrawlerStore()
    const now = new Date('2026-09-08T12:00:00Z')

    const highPriorityRecent = await makeSource(store, {
      name: 'HighPriorityRecent',
      priority: 90,
      nextDiscoveryAt: new Date(now.getTime() - 1 * 60_000),
    })
    const lowPriorityStarved = await makeSource(store, {
      name: 'LowPriorityStarved',
      priority: 50,
      nextDiscoveryAt: null,
    })

    const due = await store.listDueSources(now, 1)

    // Priority is still the primary key: fairness only breaks ties within the same band.
    expect(due.map((s) => s.id)).toEqual([highPriorityRecent.id])
    expect(due.map((s) => s.id)).not.toContain(lowPriorityStarved.id)
  })

  it('is deterministic across repeated calls for an identical tie (id as final tiebreaker)', async () => {
    const store = new MemoryCrawlerStore()
    const now = new Date('2026-09-08T12:00:00Z')

    const a = await makeSource(store, { name: 'A', priority: 50, nextDiscoveryAt: null })
    const b = await makeSource(store, { name: 'B', priority: 50, nextDiscoveryAt: null })

    const first = await store.listDueSources(now, 10)
    const second = await store.listDueSources(now, 10)

    expect(first.map((s) => s.id)).toEqual(second.map((s) => s.id))
    expect(new Set(first.map((s) => s.id))).toEqual(new Set([a.id, b.id]))
  })
})
