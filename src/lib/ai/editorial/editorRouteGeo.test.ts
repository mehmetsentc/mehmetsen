import { afterEach, describe, expect, it } from 'vitest'
import { pickAiEditorFromList } from '@/lib/ai/editorial/editorRouter'
import { editorRouteGeoFromResolved } from '@/lib/ai/editorial/editorRouteGeo'
import {
  DEFAULT_AI_CAPABILITIES,
  syntheticAiAuthorUid,
  type AiEditorDocument,
} from '@/types/aiEditor'

function desk(
  partial: Partial<AiEditorDocument> & Pick<AiEditorDocument, 'id' | 'slug' | 'name'>
): AiEditorDocument {
  return {
    authorUid: syntheticAiAuthorUid(partial.slug),
    avatarUrl: null,
    coverUrl: null,
    title: 'Editör',
    shortBio: '',
    bio: '',
    columnName: null,
    primarySpecialization: 'Gündem',
    specializations: [],
    categoryIds: ['gundem'],
    languages: ['tr'],
    status: 'active',
    isAI: true,
    verified: true,
    capabilities: { ...DEFAULT_AI_CAPABILITIES },
    publishPolicy: 'AUTO_PUBLISH',
    maxDailyNews: 20,
    maxDailyColumns: 1,
    maxDailyVideos: 0,
    modelAssignments: {},
    preferredSourceIds: [],
    allowedSourceIds: [],
    assignableForNews: true,
    scaleHardened: true,
    autoPublishUnlockThreshold: 20,
    consecutiveQualityGatePasses: 0,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    joinDate: 1,
    lastActiveAt: null,
    createdBy: 'test',
    personaType: 'local_editor',
    ...partial,
  }
}

describe('editorRouteGeoFromResolved', () => {
  it('uses resolved Muğla/Fethiye instead of the İzmir source city', () => {
    expect(
      editorRouteGeoFromResolved({
        citySlug: 'mugla',
        districtSlug: 'fethiye',
        countrySlug: null,
        forcedCitySlug: 'izmir',
      })
    ).toEqual({ citySlug: 'mugla', districtSlug: 'fethiye', countrySlug: null })
  })

  it('uses resolved Kırıkkale instead of the Eskişehir source city', () => {
    expect(
      editorRouteGeoFromResolved({
        citySlug: 'kirikkale',
        districtSlug: null,
        countrySlug: 'tr',
        forcedCitySlug: 'eskisehir',
      })
    ).toEqual({ citySlug: 'kirikkale', districtSlug: null, countrySlug: 'tr' })
  })

  it('falls back to the source city only when resolved geography is empty', () => {
    expect(
      editorRouteGeoFromResolved({
        citySlug: '',
        districtSlug: null,
        countrySlug: null,
        forcedCitySlug: 'izmir',
      })
    ).toEqual({ citySlug: 'izmir', districtSlug: null, countrySlug: null })
  })
})

describe('pickAiEditorFromList geo precedence', () => {
  afterEach(() => {
    delete process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED
  })

  it('does not send Fethiye to the İzmir desk', () => {
    const editors = [
      desk({
        id: 'izmir',
        slug: 'il-izmir-yasam',
        name: 'Gökhan Çelik',
        citySlug: 'izmir',
        categoryIds: ['yasam'],
      }),
      desk({
        id: 'mugla',
        slug: 'il-mugla-yasam',
        name: 'Muğla Yaşam',
        citySlug: 'mugla',
        categoryIds: ['yasam'],
      }),
    ]
    expect(
      pickAiEditorFromList(editors, {
        categoryId: 'yasam',
        citySlug: 'mugla',
        districtSlug: 'fethiye',
      })?.slug
    ).toBe('il-mugla-yasam')
  })

  it('does not send Kırıkkale asayiş to Eskişehir when no Kırıkkale desk exists', () => {
    const editors = [
      desk({
        id: 'eskisehir',
        slug: 'il-eskisehir-asayis',
        name: 'Ebru Akkılıç',
        citySlug: 'eskisehir',
        categoryIds: ['asayis'],
      }),
      desk({
        id: 'arda',
        slug: 'arda-sahin',
        name: 'Arda Şahin',
        citySlug: null,
        personaType: 'senior_editor',
        categoryIds: ['asayis', 'son-dakika'],
      }),
    ]
    expect(
      pickAiEditorFromList(editors, { categoryId: 'asayis', citySlug: 'kirikkale' })?.slug
    ).toBe('arda-sahin')
  })

  it('does not select another city category desk when the resolved city has no desk', () => {
    const editors = [
      desk({
        id: 'yalova',
        slug: 'il-yalova-spor',
        name: 'Barış İnce',
        citySlug: 'yalova',
        categoryIds: ['futbol', 'spor'],
      }),
      desk({
        id: 'deniz',
        slug: 'deniz-erdem',
        name: 'Deniz Erdem',
        citySlug: null,
        personaType: 'senior_editor',
        categoryIds: ['futbol', 'spor'],
      }),
    ]
    expect(
      pickAiEditorFromList(editors, { categoryId: 'futbol', citySlug: 'duzce' })?.slug
    ).toBe('deniz-erdem')
  })

  it('does not select a different country desk', () => {
    process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED = 'true'
    const editors = [
      desk({
        id: 'az',
        slug: 'ulke-azerbaycan',
        name: 'Azerbaycan',
        citySlug: null,
        countrySlug: 'azerbaycan',
        editorLayer: 'country',
        personaType: 'desk_editor',
        categoryIds: ['dunya'],
      }),
      desk({
        id: 'ua',
        slug: 'ulke-ukrayna',
        name: 'Ukrayna',
        citySlug: null,
        countrySlug: 'ukrayna',
        editorLayer: 'country',
        personaType: 'desk_editor',
        categoryIds: ['dunya'],
      }),
    ]
    expect(
      pickAiEditorFromList(editors, { categoryId: 'dunya', countrySlug: 'ukrayna' })?.slug
    ).toBe('ulke-ukrayna')
  })

  it('uses the national category desk when geography is absent', () => {
    delete process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED
    const editors = [
      desk({
        id: 'eskisehir',
        slug: 'il-eskisehir-asayis',
        name: 'Ebru Akkılıç',
        citySlug: 'eskisehir',
        categoryIds: ['asayis'],
      }),
      desk({
        id: 'arda',
        slug: 'arda-sahin',
        name: 'Arda Şahin',
        citySlug: null,
        personaType: 'senior_editor',
        categoryIds: ['asayis'],
      }),
    ]
    expect(pickAiEditorFromList(editors, { categoryId: 'asayis' })?.slug).toBe('arda-sahin')
  })
})
