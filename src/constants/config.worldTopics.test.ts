import { describe, expect, it } from 'vitest'
import { formatWorldTopicName, getWorldTopicGroups } from './config'

describe('world country topic categories', () => {
  it('offers general categories under a country and omits desk categories', () => {
    const ids = getWorldTopicGroups().flatMap((group) => group.categories.map((cat) => cat.id))
    expect(ids).toContain('gundem')
    expect(ids).toContain('spor')
    expect(ids).toContain('ekonomi')
    expect(ids).not.toContain('dunya')
    expect(ids).not.toContain('yerel-haber')
    expect(ids).not.toContain('kibris-haberleri')
    expect(formatWorldTopicName('Gündem')).toBe('Dünya Gündem')
    expect(formatWorldTopicName('Asayiş')).toBe('Dünya Asayiş')
    expect(formatWorldTopicName('Yaşam')).toBe('Dünya Yaşam')
  })
})
