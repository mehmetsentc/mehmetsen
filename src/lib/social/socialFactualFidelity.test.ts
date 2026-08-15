import { describe, expect, it } from 'vitest'
import {
  extractFactualPhrases,
  isFaithfulSocialHeadline,
  isGarbledSocialCopy,
  repairSocialCopyAgainstSource,
  repairSocialHeadline,
} from './socialFactualFidelity'

const ARACI = 'ara\u00e7\u0131'
const YANGINI = 'yang\u0131n\u0131'

describe('socialFactualFidelity', () => {
  const sourceTitle =
    `Bal\u0131kesir'de orman ${YANGINI}: Alevler yerle\u015fim yerlerine ula\u015fmadan s\u00f6nd\u00fcr\u00fcld\u00fc, 15 hava ${ARACI} m\u00fcdahale etti`
  const sourceBody =
    `Edremit'te \u00e7\u0131kan yang\u0131na 15 hava ${ARACI} ve karadan ekipler m\u00fcdahale etti. Alevler evlere ula\u015fmadan s\u00f6nd\u00fcr\u00fcld\u00fc.`

  it('extracts numbered factual phrases', () => {
    const phrases = extractFactualPhrases(sourceTitle)
    expect(phrases.some((p) => new RegExp(`15\\s+hava\\s+${ARACI}`, 'i').test(p))).toBe(true)
  })

  it('restores dropped head noun in OG-style headline', () => {
    const bad = 'Alevler evlere ula\u015fmadan s\u00f6nd\u00fcr\u00fcld\u00fc: 15 hava m\u00fcdahale etti'
    const fixed = repairSocialHeadline(bad, sourceTitle, sourceBody)
    expect(fixed).toContain(`15 hava ${ARACI} m\u00fcdahale etti`)
    expect(fixed).not.toMatch(/15\s+hava\s+m\u00fcdahale/i)
  })

  it('fixes bare hava m\u00fcdahale when source has hava araci', () => {
    const bad = 'Yang\u0131na hava m\u00fcdahale etti'
    const fixed = repairSocialCopyAgainstSource(bad, sourceTitle, sourceBody)
    expect(fixed).toContain(`hava ${ARACI} m\u00fcdahale`)
  })

  it('keeps already-correct copy unchanged', () => {
    const ok = `Alevler evlere ula\u015fmadan s\u00f6nd\u00fcr\u00fcld\u00fc: 15 hava ${ARACI} m\u00fcdahale etti`
    expect(repairSocialHeadline(ok, sourceTitle, sourceBody)).toBe(ok)
  })

  it('preserves multi-line headlines', () => {
    const bad = 'Alevler evlere ula\u015fmadan s\u00f6nd\u00fcr\u00fcld\u00fc:\n15 hava m\u00fcdahale etti'
    const fixed = repairSocialHeadline(bad, sourceTitle, sourceBody)
    expect(fixed).toContain('\n')
    expect(fixed).toContain(`15 hava ${ARACI} m\u00fcdahale`)
  })
})

describe('garbled overlay / caption copy', () => {
  const source =
    "Bozcaada'da Denizde Hareketsiz Bulunan 73 Yaşındaki Tatilci Hayatını Kaybetti"

  it('rejects mashed overlay that inserts body fragments into the title', () => {
    const ai =
      "Bozcaada'da Denizde Hareketsiz Bulunan 73 Yaşındaki tatilci kişinin yeniden hayata Tatilci Hayatını Kaybetti kişinin"
    expect(isFaithfulSocialHeadline(ai, source)).toBe(false)
  })

  it('flags repeated caption salad', () => {
    const caption =
      "Bozcaada'da tatil kabusa döndü: 73 yaşındaki kişinin yeniden hayata kişi kurtarılamadı bir kişi Tatilci Hayatını Kaybetti kişinin yeniden hayata kişi kurtarılamadı bir kişi tatilci denizde hareketsiz bulundu."
    expect(isGarbledSocialCopy(caption)).toBe(true)
  })

  it('keeps a shortened title that stays on the same facts', () => {
    const short = "Bozcaada'da 73 yaşındaki tatilci hayatını kaybetti"
    expect(isFaithfulSocialHeadline(short, source)).toBe(true)
    expect(isGarbledSocialCopy(short)).toBe(false)
  })
})
