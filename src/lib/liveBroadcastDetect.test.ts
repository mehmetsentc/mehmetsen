import { describe, expect, it } from 'vitest'
import {
  isLiveBroadcastTitle,
  shouldSkipYouTubeRssEntry,
} from '@/lib/liveBroadcastDetect'

describe('isLiveBroadcastTitle', () => {
  it('detects #Canlı and #shorts', () => {
    expect(isLiveBroadcastTitle('Fatih Erbakan açıklama yapıyor #Canlı')).toBe(true)
    expect(isLiveBroadcastTitle('Gündem özeti #shorts')).toBe(true)
    expect(isLiveBroadcastTitle('Apple yeni iPhone tanıttı')).toBe(false)
  })

  it('detects present-tense live statements without hashtag', () => {
    expect(isLiveBroadcastTitle('Elazığ madenciler açıklama yapıyor')).toBe(true)
    expect(isLiveBroadcastTitle('Bakan açıklama yaptı')).toBe(false)
  })
})

describe('shouldSkipYouTubeRssEntry', () => {
  it('skips live titles even with long description', () => {
    const long = 'a'.repeat(120)
    expect(shouldSkipYouTubeRssEntry('Mahmud Abbas karşılanıyor #Canlı', long).skip).toBe(true)
  })

  it('skips thin video-only descriptions', () => {
    expect(shouldSkipYouTubeRssEntry('Yeni ürün videosu', 'kısa').reason).toBe(
      'video_only_thin_body'
    )
  })

  it('allows real article-like youtube posts', () => {
    const desc =
      'Apple yeni çipini tanıttı. Performans artışı yüzde kırk civarında. Detaylar ve benchmark sonuçları aşağıda.'
    expect(shouldSkipYouTubeRssEntry('Apple yeni çipini tanıttı', desc).skip).toBe(false)
  })
})
