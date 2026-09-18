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
