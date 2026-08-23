import { describe, expect, it } from 'vitest'
import { combinedSourceText } from './contentQuality'

describe('combinedSourceText', () => {
  it('does not double-count identical RSS snippet as content+summary', () => {
    const snippet =
      "Muğla'nın Bodrum ilçesinde etkisini artıran sıcak hava dalgası nedeniyle hissedilen sıcaklık 45 dereceye kadar çıktı."
    expect(combinedSourceText(snippet, snippet)).toBe(snippet)
    expect(combinedSourceText(snippet, snippet).length).toBe(snippet.length)
  })

  it('keeps longer body when summary is a subset', () => {
    const body = ('Tam haber gövdesi. ' + 'kelime '.repeat(80)).trim()
    const summary = 'Tam haber gövdesi.'
    expect(combinedSourceText(body, summary)).toBe(body)
  })

  it('joins distinct content and summary', () => {
    expect(combinedSourceText('Gövde bir.', 'Özet iki.')).toBe('Gövde bir.\nÖzet iki.')
  })

  it('handles empty sides', () => {
    expect(combinedSourceText('', 'sadece özet')).toBe('sadece özet')
    expect(combinedSourceText('sadece gövde', '')).toBe('sadece gövde')
    expect(combinedSourceText('', '')).toBe('')
  })
})
