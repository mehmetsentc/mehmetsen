import { describe, expect, it } from 'vitest'
import {
  buildMediaFilename,
  estimateReadingTimeMinutes,
  normalizeMediaFilename,
  resolveDistributionFields,
} from './distributionMeta'

describe('distributionMeta', () => {
  it('estimates reading time from word count', () => {
    const words = Array.from({ length: 420 }, () => 'haber').join(' ')
    expect(estimateReadingTimeMinutes(words)).toBe(3)
    expect(estimateReadingTimeMinutes('kısa')).toBe(1)
  })

  it('builds image and video filenames from the title', () => {
    expect(buildMediaFilename('Belgin Arı 4 madalya kazandı', 'image')).toBe(
      'belgin-ari-4-madalya-kazandi.jpg'
    )
    expect(buildMediaFilename('Belgin Arı 4 madalya kazandı', 'video', 1)).toBe(
      'belgin-ari-4-madalya-kazandi-2.mp4'
    )
  })

  it('sanitizes messy filenames', () => {
    expect(normalizeMediaFilename('Belgin Arı Balkan.PNG', 'image', 'haber')).toBe(
      'belgin-ari-balkan.png'
    )
    expect(normalizeMediaFilename('???', 'video', 'Pist şampiyonası')).toBe(
      'pist-sampiyonasi.mp4'
    )
  })

  it('maps screenshot aliases and per-media alt/filename', () => {
    const fields = resolveDistributionFields({
      parsed: {
        socialTitle: 'Çanakkaleli öğretmenden 4 madalya',
        socialDescription: 'Sınıfta öğrenciyle, pistte başarılarıyla örnek oldu.',
        pushTitle: 'Çanakkaleli öğretmenden 4 madalya',
        pushText: 'Belgin Arı Balkan Masterler’de 4 madalya kazandı.',
        imageAlt: 'Balkan pistinde madalya kazanan öğretmen',
        imageFilename: 'belgin-ari-balkan-madalya.jpg',
        readingTime: 2,
        mediaMeta: [
          {
            url: 'https://cdn.example/cover.jpg',
            alt: 'Kapak: pistte koşan atlet',
            filename: 'kapak-pist.jpg',
          },
          {
            url: 'https://cdn.example/race.mp4',
            alt: 'Bayrak yarışı videosu',
            filename: 'bayrak-yarisi.mp4',
          },
        ],
      },
      title: 'Belgin Arı Balkan Masterler’de 4 madalya kazandı',
      spot: 'Türkiye milli takımıyla 4 madalya.',
      content: 'Uzun haber gövdesi.',
      imageUrls: ['https://cdn.example/cover.jpg'],
      videoUrls: ['https://cdn.example/race.mp4'],
    })

    expect(fields.socialHeadline).toMatch(/4 madalya/)
    expect(fields.socialStorySummary).toMatch(/örnek oldu/)
    expect(fields.pushTitle.length).toBeGreaterThan(8)
    expect(fields.readingTimeMinutes).toBe(2)
    expect(fields.imageAlt).toBe('Kapak: pistte koşan atlet')
    expect(fields.imageFilename).toBe('kapak-pist.jpg')
    expect(fields.videoAlt).toBe('Bayrak yarışı videosu')
    expect(fields.videoFilename).toBe('bayrak-yarisi.mp4')
    expect(fields.mediaMeta).toHaveLength(2)
  })
})
