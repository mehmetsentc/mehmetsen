import { describe, expect, it } from 'vitest'
import {
  isGenericEditorName,
  isSourceLikeName,
  resolveFeedEditorByline,
} from '@/lib/feed/resolveFeedEditorByline'

describe('resolveFeedEditorByline', () => {
  it('treats city and outlet names as sources, not editors', () => {
    expect(isGenericEditorName('NaHaber')).toBe(true)
    expect(isSourceLikeName('Çanakkale')).toBe(true)
    expect(isSourceLikeName('Çanakkale Kalem', 'Çanakkale Kalem')).toBe(true)
    expect(isSourceLikeName('Aylin Yılmaz')).toBe(false)
  })

  it('uses the Çanakkale seed editor when the card only has a source name', () => {
    const editor = resolveFeedEditorByline({
      authorName: 'Çanakkale Kalem',
      publisherName: 'Çanakkale Kalem',
      citySlug: 'canakkale',
    })
    expect(editor?.name).toBeTruthy()
    expect(editor?.name).not.toMatch(/Çanakkale/i)
    expect(editor?.name).not.toMatch(/Kalem/i)
    expect(editor?.slug).toBe('yerel-canakkale')
  })

  it('replaces newspaper sources like Milliyet with the national desk editor', () => {
    expect(isSourceLikeName('Milliyet')).toBe(true)
    const milliyet = resolveFeedEditorByline({
      authorName: 'Milliyet',
      publisherName: 'Milliyet',
      categoryId: 'asayis',
    })
    expect(milliyet?.slug).toBe('arda-sahin')
    expect(milliyet?.name).toBe('Arda Şahin')
  })

  it('replaces an agency source like Anka Haber with the national desk editor', () => {
    const editor = resolveFeedEditorByline({
      authorName: 'Anka Haber Ajansı',
      publisherName: 'Anka Haber Ajansı',
      categoryId: 'gundem',
    })
    expect(editor?.slug).toBe('ece-yalin')
    expect(editor?.name).toBe('Ece Yalın')
    expect(editor?.name).not.toMatch(/Anka/i)
  })

  it('keeps a real journalist name instead of swapping in the national desk', () => {
    const editor = resolveFeedEditorByline({
      authorName: 'Ayşe Demir',
      categoryId: 'gundem',
    })
    expect(editor?.name).toBe('Ayşe Demir')
    expect(editor?.slug).not.toBe('ece-yalin')
  })

  it('assigns a distinct Çanakkale category editor for spor', () => {
    const editor = resolveFeedEditorByline({
      authorName: 'Çanakkale Kalem',
      publisherName: 'Çanakkale Kalem',
      citySlug: 'canakkale',
      categoryId: 'spor',
    })
    expect(editor?.name).toBe('Yiğit Anafarta')
    expect(editor?.slug).toBe('yigit-anafarta')
  })

  it('assigns a distinct Antalya category editor for ekonomi', () => {
    const editor = resolveFeedEditorByline({
      authorName: 'Antalya',
      citySlug: 'antalya',
      categoryId: 'ekonomi',
    })
    expect(editor?.name).toBe('Sibel Manavgat')
    expect(editor?.slug).toBe('sibel-manavgat')
  })
})
