import { describe, expect, it } from 'vitest'
import { isRssContentTruncated } from './rssTruncation'

describe('isRssContentTruncated', () => {
  it('flags short clips ending mid-word', () => {
    expect(isRssContentTruncated('Aziz Yıldırım ve yönetim k')).toBe(true)
  })

  it('does not flag long Habertürk-style bodies ending without a period', () => {
    const body =
      'Kocaeli nin Gebze ilçesinde ormanlık alanda yangın başladı. '.repeat(12) +
      'Ekipler bölgede söndürme çalışmalarına başladı'
    expect(body.length).toBeGreaterThan(500)
    expect(isRssContentTruncated(body)).toBe(false)
  })

  it('flags ellipsis and dangling conjunctions', () => {
    expect(isRssContentTruncated('Haber metni burada…')).toBe(true)
    expect(isRssContentTruncated('Açıklama yaptı ve')).toBe(true)
  })
})
