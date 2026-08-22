import { describe, expect, it } from 'vitest'
import { parseQueueTab, queueCountsFromStatuses } from './query'

describe('raw article review queue tab', () => {
  it('parses review queue tab', () => {
    expect(parseQueueTab('review')).toBe('review')
    expect(parseQueueTab('active')).toBe('active')
  })

  it('includes review count in queue counts', () => {
    expect(queueCountsFromStatuses({ NEW: 3, PUBLISHED: 2 }, 4)).toEqual({
      active: 3,
      published: 2,
      review: 4,
      rejected: 0,
      archived: 0,
    })
  })
})
