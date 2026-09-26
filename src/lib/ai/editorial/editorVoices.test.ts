import { describe, expect, it } from 'vitest'
import { SEED_AI_EDITORS } from './seedEditors'
import { SEED_CITY_AI_EDITORS } from './seedCityEditors'
import { EDITOR_VOICES, voiceCardForEditor } from './editorVoices'

describe('editor voice cards', () => {
  it('gives every national persona a distinct headline and a political line', () => {
    const goods = EDITOR_VOICES.map((voice) => voice.good)
    expect(new Set(goods).size).toBe(goods.length)
    for (const spec of SEED_AI_EDITORS) {
      expect(spec.prompts.core).toContain(`SES KARTI: ${spec.slug}`)
      expect(spec.prompts.core).toContain('SİYASİ ÇİZGİ:')
      expect(spec.prompts.core).toContain('HABER SUNUŞU:')
      expect(spec.prompts.core).toContain('YAŞAM VE ALAN:')
    }
  })

  it('keeps breaking factual and other desks open-ended', () => {
    const arda = SEED_AI_EDITORS.find((spec) => spec.slug === 'arda-sahin')
    const selin = SEED_AI_EDITORS.find((spec) => spec.slug === 'selin-aras')
    expect(arda?.prompts.core).toContain('düz ve kısa olgu')
    expect(selin?.prompts.core).toContain('Emeklinin payı masada kaldı')
    expect(selin?.prompts.core).not.toContain('ŞOK! Markalar')
  })

  it('writes a city card for each province editor', () => {
    expect(SEED_CITY_AI_EDITORS.length).toBe(81)
    for (const spec of SEED_CITY_AI_EDITORS) {
      expect(spec.prompts.core).toContain(`SES KARTI: ${spec.slug}`)
      expect(spec.prompts.core).toContain('hangi partiden olursa')
    }
    const card = voiceCardForEditor({
      slug: 'yerel-canakkale',
      name: 'Test Editör',
      desk: 'Yerel · Çanakkale',
      citySlug: 'canakkale',
    })
    expect(card).toContain('Çanakkale')
    expect(card).toContain('İlçe + bitmemiş iş')
  })
})
