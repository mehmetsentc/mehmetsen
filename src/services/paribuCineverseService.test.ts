import { describe, expect, it } from 'vitest'
import {
  buildParibuEventId,
  dateParamToIso,
  parseAvailableDateParams,
  parseIstanbulSessionIso,
  parseMovieSessionsFromHtml,
  slugifyMovieTitle,
} from '@/services/paribuCineverseService'

const FIXTURE_HTML = `
<div data-full-date-reverse="10-08-2026" class="card calendar-card active"></div>
<div data-full-date-reverse="11-08-2026" class="card calendar-card"></div>
<script type="application/ld+json">
{
  "@type": "MovieTheater",
  "mainEntity": {
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": [{
        "@type": "ListItem",
        "item": {
          "@type": "Movie",
          "name": "Ziyaretçiler: Hesaplaşma",
          "genre": "Korku",
          "description": "Test film.",
          "image": "https://www.paribucineverse.com/files/movie_posters/test.png"
        }
      }]
    }
  }
}
</script>
<div data-movie-title="Ziyaret&#231;iler: Hesaplaşma">
  <span id="movieGenre">Korku</span>
  <span class="cinema-detail-tech-text">2D - ALTYAZILI</span>
  <a class="cinema-list-item" data-url="/biletleme/session-1" data-time="12:45 PM">12:45</a>
  <a class="cinema-list-item" data-url="/biletleme/session-2" data-time="3:00 PM">15:00</a>
</div>
`

describe('paribuCineverseService', () => {
  it('parses date tabs from the cinema page', () => {
    const dates = parseAvailableDateParams(FIXTURE_HTML)
    expect(dates).toEqual(['10-08-2026', '11-08-2026'])
    expect(dateParamToIso(dates[0])).toBe('2026-08-10')
  })

  it('parses movie-day sessions from HTML', () => {
    const movies = parseMovieSessionsFromHtml(FIXTURE_HTML, '10-08-2026')
    expect(movies).toHaveLength(1)
    expect(movies[0].title).toBe('Ziyaretçiler: Hesaplaşma')
    expect(movies[0].sessions).toHaveLength(2)
    expect(movies[0].genre).toBe('Korku')
  })

  it('builds stable event ids and Istanbul session times', () => {
    expect(parseIstanbulSessionIso('2026-08-10', '12:45 PM')).toBe(
      '2026-08-10T09:45:00.000Z'
    )

    const slug = slugifyMovieTitle('Ziyaretçiler: Hesaplaşma')
    expect(buildParibuEventId(slug, '2026-08-10')).toBe(
      `paribu-17burda-${slug}-2026-08-10`
    )
  })
})
