import { describe, expect, it } from 'vitest'
import { pronunciationPrompt, pronunciationsIn, toPronunciationSsml } from './pronunciation'

describe('telaffuz sözlüğü', () => {
  it('Batman ilini eki ile birlikte bulur', () => {
    for (const t of ["Batman'da yağmur", 'Batmanlı gençler', "Batman'ın Kozluk ilçesinde", 'Batman Valiliği açıkladı', 'Olay Batman.'])
      expect(pronunciationsIn(t).map((p) => p.word)).toEqual(['Batman'])
  })
  it('başka sözcüklerde yanlış eşleşmez', () => {
    for (const t of ['Abatman köyü', 'Batmancı', 'Ankara’da toplantı']) expect(pronunciationsIn(t)).toEqual([])
  })
  it('Google sesleri için SSML: phoneme + kaçış', () => {
    const s = toPronunciationSsml("Batman'da A & B <test>")!
    expect(s).toBe('<speak><phoneme alphabet="ipa" ph="ˈbatman">Batman</phoneme>\'da A &amp; B &lt;test&gt;</speak>')
    expect(toPronunciationSsml('Ankara’da hava güzel')).toBeNull()
  })
  it('Gemini yönergesine not yalnız gerektiğinde', () => {
    expect(pronunciationPrompt('Batman merkezde')).toMatch(/Turkish way/)
    expect(pronunciationPrompt('Siirt merkezde')).toBe('')
  })
})
