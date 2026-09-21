import { describe, expect, it } from 'vitest'
import {
  collectBubiletEventLinks,
  collectBubiletSeansLinks,
  extractBubiletSubEvents,
  parseBubiletDetail,
  parseBubiletSeansId,
} from './bubilet'
import { looksLikeChallengePage } from './occurrence'

const LISTING = `
  <a href="/istanbul/etkinlik/yalin-bir-buyulu-gece">Yalın</a>
  <a href="/istanbul/etkinlik/yalin-bir-buyulu-gece?ref=1">Yalın dup</a>
  <a href="/istanbul/etkinlik/other-show">Other</a>
`

const DETAIL = `
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Event","name":"Yalın","startDate":"2026-11-06T18:00:00+00:00","endDate":"2026-11-06T19:30:00+00:00","image":["https://cdn.bubilet.com.tr/files/Etkinlik/yalin.png"],"location":{"@type":"Place","name":"Volkswagen Arena","address":{"streetAddress":"Maslak, Sarıyer/İstanbul","addressLocality":"İstanbul"}},"offers":{"url":"https://www.bubilet.com.tr/istanbul/etkinlik/yalin-bir-buyulu-gece"},"subEvent":[{"@type":"Event","name":"Yalın","startDate":"2026-11-06T18:00:00+00:00","endDate":"2026-11-06T19:30:00+00:00","location":{"@type":"Place","name":"Volkswagen Arena","address":{"streetAddress":"Maslak","addressLocality":"İstanbul"}}},{"@type":"Event","name":"Yalın","startDate":"2026-11-07T18:00:00+00:00","endDate":"2026-11-07T19:30:00+00:00","location":{"@type":"Place","name":"Volkswagen Arena","address":{"streetAddress":"Maslak","addressLocality":"İstanbul"}}}]}
  </script>
  <a href="/istanbul/etkinlik/yalin-bir-buyulu-gece/seans/284062">18:00</a>
  <a href="/istanbul/etkinlik/yalin-bir-buyulu-gece/seans/284063">18:00 next</a>
`

describe('Bubilet sessions', () => {
  it('collects unique event containers from listing HTML', () => {
    expect(collectBubiletEventLinks(LISTING, 'istanbul')).toEqual([
      '/istanbul/etkinlik/yalin-bir-buyulu-gece',
      '/istanbul/etkinlik/other-show',
    ])
  })

  it('expands JSON-LD subEvent into two occurrences with seans ids', () => {
    const parsed = parseBubiletDetail(
      DETAIL,
      'https://www.bubilet.com.tr/istanbul/etkinlik/yalin-bir-buyulu-gece',
      'istanbul'
    )
    expect(extractBubiletSubEvents({ subEvent: [{}, {}] })).toHaveLength(2)
    expect(parsed.events).toHaveLength(2)
    expect(parsed.containers).toBe(1)
    expect(parsed.events[0].startsAt).not.toBe(parsed.events[1].startsAt)
    expect(parsed.events[0].externalId).toBe('seans:284062')
    expect(parsed.events[1].externalId).toBe('seans:284063')
    expect(parsed.events[0].ticketUrl).toContain('/seans/284062')
    expect(parsed.events[0].coverImageUrl).toContain('/files/Etkinlik/yalin.png')
    expect(parseBubiletSeansId('/istanbul/etkinlik/x/seans/284062')).toBe('284062')
    expect(collectBubiletSeansLinks(DETAIL, 'istanbul')).toHaveLength(2)
  })

  it('treats a Cloudflare challenge as blocked, not an empty city', () => {
    const challenge = '<html><title>Just a moment...</title><div id="challenge-platform"></div></html>'
    expect(looksLikeChallengePage(challenge, 403)).toBe(true)
    expect(looksLikeChallengePage('<html><script src="https://cdn-cgi/challenge-platform/x"></script></html>', 200)).toBe(false)
    expect(collectBubiletEventLinks(challenge, 'istanbul')).toEqual([])
  })
})
