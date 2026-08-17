import { describe, expect, it } from 'vitest'
import {
  isEnqueueSkipId,
  isTooThinToEnqueue,
  MIN_ENQUEUE_QUALITY,
  scoreQueueContentQuality,
  shouldSkipThinEnqueue,
} from '@/services/newsroom/queue/queueQualityCompare'
import { qualityDiscardReason } from '@/services/newsroom/pipelineQualityDiscard'
import type { NewsroomArticleInput } from '@/services/newsroom/types'
import {
  decidePeerQuality,
  type QueuePeerCandidate,
} from '@/services/newsroom/queue/queueDuplicateSweep'
import type { NewsQueueDocument } from '@/services/newsroom/queue/types'

function candidate(
  id: string,
  title: string,
  content: string,
  qualityScore: number
): QueuePeerCandidate {
  return {
    id,
    title,
    body: content,
    qualityScore,
    data: {
      input: {
        originalTitle: title,
        originalContent: content,
        originalSummary: '',
      },
    } as NewsQueueDocument,
  }
}

describe('isTooThinToEnqueue', () => {
  it('rejects stub copy below the quality floor', () => {
    const score = scoreQueueContentQuality({
      title: 'Kısa',
      summary: 'az',
      content: '',
    })
    expect(score).toBeLessThan(MIN_ENQUEUE_QUALITY)
    expect(isTooThinToEnqueue(score)).toBe(true)
  })

  it('keeps a full article with image', () => {
    const score = scoreQueueContentQuality({
      title: 'Çanakkale’de sahil yolunda zincirleme kaza: 3 yaralı',
      summary: 'Kaza sonrası ekipler olay yerine sevk edildi. '.repeat(8),
      content: 'Yetkililer açıklama yaptı. '.repeat(40),
      imageUrl: 'https://example.com/photo.jpg',
      sourceLabel: 'AA',
    })
    expect(isTooThinToEnqueue(score)).toBe(false)
  })
})

describe('decidePeerQuality', () => {
  it('drops the incoming item on a near-duplicate tie so the queue stays clean', () => {
    const self = candidate('new', 'Aynı kaza haberi şehir merkezinde', 'gövde '.repeat(80), 70)
    const peer = candidate('old', 'Aynı kaza haberi şehir merkezinde', 'gövde '.repeat(80), 70)
    const decision = decidePeerQuality(self, peer, 0.85)
    expect(decision.dropSelf).toBe(true)
    expect(decision.dropPeer).toBe(false)
    expect(decision.needsReview).toBe(false)
  })

  it('drops the weaker peer when the new item is richer', () => {
    const self = candidate('new', 'Aynı kaza haberi detaylı anlatımla', 'uzun gövde '.repeat(120), 88)
    const peer = candidate('old', 'Aynı kaza haberi kısa', 'kısa', 40)
    const decision = decidePeerQuality(self, peer, 0.8)
    expect(decision.dropPeer).toBe(true)
    expect(decision.dropSelf).toBe(false)
    expect(decision.needsReview).toBe(false)
  })
})

describe('shouldSkipThinEnqueue', () => {
  it('lets short RSS with a source URL through so the pipeline can extract', () => {
    const input = {
      originalTitle: 'Kısa',
      originalSummary: 'az',
      originalContent: '',
      sourceUrl: 'https://example.com/haber',
    } as NewsroomArticleInput
    expect(shouldSkipThinEnqueue(input)).toBe(false)
  })

  it('drops stub copy that has no source URL to extract', () => {
    const input = {
      originalTitle: 'Kısa',
      originalSummary: 'az',
      originalContent: '',
    } as NewsroomArticleInput
    expect(shouldSkipThinEnqueue(input)).toBe(true)
  })
})

describe('isEnqueueSkipId', () => {
  it('detects ingest skip tokens', () => {
    expect(isEnqueueSkipId('thin-skip-abc')).toBe(true)
    expect(isEnqueueSkipId('peer-skip-abc')).toBe(true)
    expect(isEnqueueSkipId('library-skip-abc')).toBe(true)
    expect(isEnqueueSkipId('real-firestore-id')).toBe(false)
  })
})

describe('qualityDiscardReason', () => {
  it('skips short, incomplete, or badly fact-checked copy', () => {
    expect(qualityDiscardReason({
      bodyTooShort: true,
      incompleteText: false,
      factCheckFailedBadly: false,
    })).toBe('body_too_short')
    expect(qualityDiscardReason({
      bodyTooShort: false,
      incompleteText: true,
      factCheckFailedBadly: false,
    })).toBe('incomplete_text')
    expect(qualityDiscardReason({
      bodyTooShort: false,
      incompleteText: false,
      factCheckFailedBadly: true,
    })).toBe('fact_check_failed')
    expect(qualityDiscardReason({
      bodyTooShort: false,
      incompleteText: false,
      factCheckFailedBadly: false,
    })).toBeNull()
  })
})
