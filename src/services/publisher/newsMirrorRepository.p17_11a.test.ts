import { describe, expect, it } from 'vitest'
import {
  buildNewsMirrorConflictSet,
  buildNewsMirrorInsertValues,
  type NewsMirrorPayload,
} from './newsMirrorRepository'

function basePayload(overrides: Partial<NewsMirrorPayload> = {}): NewsMirrorPayload {
  return {
    id: 'news_mirror_test_1',
    slug: 'test-slug-news_mir',
    title: 'Test Title',
    summary: 'summary',
    description: 'description',
    content: 'body',
    htmlContent: '<p>body</p>',
    categoryId: 'gundem',
    cityName: null,
    citySlug: null,
    districtName: null,
    districtSlug: null,
    authorId: 'human_editor_uid_abc',
    authorDisplayName: 'Operator Pilot User',
    source: 'Source',
    sourceUrl: 'https://example.com/a',
    thumbnailUrl: null,
    coverImageUrl: null,
    videoUrl: null,
    tags: ['gundem'],
    isBreaking: false,
    seoTitle: 'Test Title',
    seoDescription: 'summary',
    publishedAt: new Date('2026-09-01T13:10:41.490Z'),
    ...overrides,
  }
}

describe('P17.11A — newsMirrorRepository author attribution', () => {
  const now = new Date('2026-09-01T14:00:00.000Z')

  it('INSERT includes authoritative authorId', () => {
    const values = buildNewsMirrorInsertValues(basePayload(), now)
    expect(values.authorId).toBe('human_editor_uid_abc')
    expect(values.authorDisplayName).toBe('Operator Pilot User')
    expect(values.status).toBe('published')
  })

  it('INSERT with intentional null authorId mirrors null', () => {
    const values = buildNewsMirrorInsertValues(basePayload({ authorId: null }), now)
    expect(values.authorId).toBeNull()
  })

  it('INSERT with omitted authorId defaults to null (does not invent a UID)', () => {
    const payload = basePayload()
    delete payload.authorId
    const values = buildNewsMirrorInsertValues(payload, now)
    expect(values.authorId).toBeNull()
    expect(values).not.toHaveProperty('authorId', undefined)
  })

  it('UPSERT conflict set writes new valid authorId', () => {
    const set = buildNewsMirrorConflictSet(
      basePayload({ authorId: 'wG8WTNlW38TILLvpDLsFmt8IMlg1' }),
      now
    )
    expect(set.authorId).toBe('wG8WTNlW38TILLvpDLsFmt8IMlg1')
    expect(set.authorDisplayName).toBe('Operator Pilot User')
  })

  it('UPSERT unrelated field update does not erase existing authorId via undefined', () => {
    const payload = basePayload({ title: 'Updated Title Only' })
    delete payload.authorId
    delete payload.authorDisplayName
    const set = buildNewsMirrorConflictSet(payload, now)
    expect(Object.prototype.hasOwnProperty.call(set, 'authorId')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(set, 'authorDisplayName')).toBe(false)
    expect(set.title).toBe('Updated Title Only')
  })

  it('UPSERT with intentional null authorId writes null (does not invent fallback)', () => {
    const set = buildNewsMirrorConflictSet(basePayload({ authorId: null }), now)
    expect(Object.prototype.hasOwnProperty.call(set, 'authorId')).toBe(true)
    expect(set.authorId).toBeNull()
  })
})
