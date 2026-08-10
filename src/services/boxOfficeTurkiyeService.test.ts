import { describe, expect, it } from 'vitest'
import {
  extractLatestWeekKeyFromHomepage,
  parseWeekKey,
  parseWeeklyDetailHtml,
} from '@/services/boxOfficeTurkiyeService'

describe('boxOfficeTurkiyeService', () => {
  it('parseWeekKey accepts YYYY-WW', () => {
    expect(parseWeekKey('2026-31')).toEqual({ year: 2026, week: 31 })
    expect(parseWeekKey('bad')).toBeNull()
  })

  it('extractLatestWeekKeyFromHomepage finds hafta link', () => {
    const html = '<a href="/hafta/detay/2026-31">özet tablo</a>'
    expect(extractLatestWeekKeyFromHomepage(html)).toBe('2026-31')
  })

  it('parseWeeklyDetailHtml extracts films and totals', () => {
    const html = `
      <div>Toplam Seyirci<div class="color-gray-87"><strong>1.700.335</strong></div></div>
      <div>Toplam Hasılat<div class="color-gray-87"><strong><span>₺489.503.292</span></strong></div></div>
      <div>Film Sayısı<div class="color-gray-87"><strong>47</strong></div></div>
      <table id="WeeklyMovieData"><tbody>
        <tr>
          <td>1</td>
          <td><a class="movie-link" href="/film/test--1">Test Film</a> 1 Ocak 2026</td>
          <td>TME</td><td>100</td><td>1</td>
          <td>₺10.000</td><td>5.000</td><td>₺10.000</td><td>5.000</td>
        </tr>
      </tbody></table>
    `
    const data = parseWeeklyDetailHtml(html, '2026-31')
    expect(data).not.toBeNull()
    expect(data!.weekKey).toBe('2026-31')
    expect(data!.films[0]?.title).toBe('Test Film')
    expect(data!.totalAudience).toBe('1.700.335')
    expect(data!.totalRevenue).toContain('₺')
  })
})
