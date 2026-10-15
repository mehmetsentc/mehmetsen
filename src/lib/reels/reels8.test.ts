import { describe, expect, it, vi } from 'vitest'

vi.mock('@napi-rs/canvas', () => ({ createCanvas: vi.fn(), loadImage: vi.fn(), GlobalFonts: { registerFromPath: vi.fn() } }))

import { layoutText, summaryOptions, type Geo } from './headlineCard'
import { isReelCoverVariant } from './reelCover'
import { parseVoiceSettings } from './voiceRules'

// 20 px per character: easy to reason about widths
const measure = (font: string, s: string) => s.length * (parseInt(font, 10) * 0.6)
const G: Geo = { W: 1080, H: 1920, x: 84, textW: 870, logoY: 270, logo: 1, bottom: 1640, head: [58, 52, 46, 40], comfy: 49, sum: [34, 30], sumLines: 5, tagH: 64 }

describe('REELS-8 Foto card text', () => {
  it('splits the summary only at real sentence ends', () => {
    expect(summaryOptions('Sefer 06.00’da başlıyor. Ücret 3.5 TL! Son')).toEqual([
      'Sefer 06.00’da başlıyor. Ücret 3.5 TL! Son',
      'Sefer 06.00’da başlıyor. Ücret 3.5 TL!',
      'Sefer 06.00’da başlıyor.',
    ])
    expect(summaryOptions('  ')).toEqual([])
  })
  it('keeps the whole headline and never adds an ellipsis', () => {
    const head = 'ÇANAKKALE BOĞAZI’NDA FIRTINA ALARMI: GESTAŞ BOZCAADA VE GÖKÇEADA SEFERLERİNİ İKİ GÜN BOYUNCA İPTAL ETTİĞİNİ DUYURDU'
    const sum = 'Birinci cümle burada bitiyor. ' + 'İkinci cümle çok uzun '.repeat(30) + 'bitti.'
    const L = layoutText(measure, head, sum, G, 1000)
    expect(L.head.join(' ')).toBe(head)
    expect(L.sum.join(' ')).toBe('Birinci cümle burada bitiyor.')
    expect([...L.head, ...L.sum].some((l) => l.includes('…'))).toBe(false)
    expect(L.blockH).toBeLessThanOrEqual(1000)
  })
  it('foto is the cover look and a valid studio setting', () => {
    expect(isReelCoverVariant('foto')).toBe(true)
    expect(parseVoiceSettings({ cover: 'foto' }).cover).toBe('foto')
  })
})
