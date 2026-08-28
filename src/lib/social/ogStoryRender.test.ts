import { describe, it, expect } from 'vitest'
import { getBundledOgFontsSync, loadStoryFonts, loadPostFonts } from './ogFonts'
import { createStoryCardSharp, createPostCardSharp } from './imageOverlay'

describe('Bundled OG Fonts', () => {
  it('loads all 6 bundled Inter font weights with non-zero buffer', () => {
    const fonts = getBundledOgFontsSync()
    expect(fonts.length).toBe(6)
    const weights = fonts.map((f) => f.weight)
    expect(weights).toContain(400)
    expect(weights).toContain(700)
    expect(weights).toContain(800)
    for (const f of fonts) {
      expect(f.data.byteLength).toBeGreaterThan(100_000)
      expect(f.name).toBe('Inter')
    }
  })

  it('provides story and post fonts correctly', async () => {
    const storyFonts = await loadStoryFonts()
    const postFonts = await loadPostFonts()
    expect(storyFonts.length).toBeGreaterThanOrEqual(3)
    expect(postFonts.length).toBeGreaterThanOrEqual(3)
  })

  it('renders story card with Turkish characters into a JPEG buffer in-process', async () => {
    const jpeg = await createStoryCardSharp({
      imageSource: '',
      title: 'Beşiktaş\'ta silahlı saldırı: Eski bakanın oğlu bacağından vuruldu',
      summary: 'Eski bakan Mehmet Ali Yılmaz\'ın oğlu Soner Yılmaz, Bebek\'teki evinde uğradığı silahlı saldırıda iki bacağına üç kurşun isabet etti. Ameliyatı başarılı geçti, sağlık durumu stabil.',
      categoryId: 'son-dakika',
      isBreaking: true,
    })

    expect(jpeg).toBeInstanceOf(Buffer)
    expect(jpeg.length).toBeGreaterThan(5000)
    // Verify it is a valid JPEG (starts with 0xFF 0xD8)
    expect(jpeg[0]).toBe(0xff)
    expect(jpeg[1]).toBe(0xd8)
  })

  it('renders feed post card with Turkish characters into a JPEG buffer in-process', async () => {
    const jpeg = await createPostCardSharp({
      imageSource: '',
      title: 'Çanakkale Boğazı\'nda yoğun sis nedeniyle gemi trafiği çift yönlü durduruldu',
      categoryId: 'gundem',
      isBreaking: false,
    })

    expect(jpeg).toBeInstanceOf(Buffer)
    expect(jpeg.length).toBeGreaterThan(5000)
    expect(jpeg[0]).toBe(0xff)
    expect(jpeg[1]).toBe(0xd8)
  })
})
