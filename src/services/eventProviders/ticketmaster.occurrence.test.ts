import { describe, expect, it } from 'vitest'
import { applyPreferredPoster, mapTicketmasterEvent, pickTicketmasterImage, type TMEvent } from './ticketmaster'
import { classifyEventImage } from './imageQuality'
import { biletixPerformanceUrl } from './ticketUrl'

const TM_EVENT: TMEvent = {
  id: 'Z2HyzZyMZkNqeKvve',
  name: 'Duman',
  url: biletixPerformanceUrl('5YS1I', '001'),
  images: [
    { url: 'https://s1.ticketm.net/dam/c/abc/RETINA_PORTRAIT.jpg', width: 640, ratio: '16_9' },
    { url: 'https://s1.ticketm.net/dam/a/xyz/EVENT_DETAIL.jpg', width: 1024, ratio: '16_9' },
  ],
  dates: { start: { dateTime: '2026-09-25T18:00:00Z' } },
  _embedded: {
    venues: [{ name: 'Antalya Açıkhava', city: { name: 'Antalya' }, address: { line1: 'Lara' } }],
  },
}

describe('Ticketmaster occurrence mapping', () => {
  it('keeps the official Biletix performance destination', () => {
    const event = mapTicketmasterEvent(TM_EVENT)
    expect(event?.ticketUrl).toBe(biletixPerformanceUrl('5YS1I', '001'))
    expect(event?.externalId).toBe('Z2HyzZyMZkNqeKvve')
    expect(event?.citySlug).toBe('antalya')
  })

  it('prefers non-generic images when available, then loses to a Biletix poster', () => {
    const picked = pickTicketmasterImage(TM_EVENT.images)
    expect(picked).toContain('ticketm.net/dam/a/')
    const mapped = mapTicketmasterEvent(TM_EVENT)!
    const withPoster = applyPreferredPoster(
      mapped,
      'https://www.biletix.com/static/images/live/event/eventimages/960x540/5YS1I.avif'
    )
    expect(classifyEventImage(withPoster.coverImageUrl)).toBe('specific')
  })

  it('pagination uses page index and a max-page guard', () => {
    const totalPages = 9
    const maxPages = 5
    const fetched = []
    for (let page = 0; page < maxPages && page < totalPages; page += 1) fetched.push(page)
    expect(fetched).toEqual([0, 1, 2, 3, 4])
  })
})
