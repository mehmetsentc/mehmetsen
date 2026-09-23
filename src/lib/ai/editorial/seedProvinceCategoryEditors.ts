/**
 * Wave 1: parametric il×kategori desks for the 79 provinces that are not
 * the Çanakkale/Antalya journalist-named pilot (Wave 0).
 * Slug: il-{city}-{desk}. Not added to allSeedEditorSpecs().
 */

import { getDistrictsForProvince, TURKISH_PROVINCES } from '@/constants/cities'
import { DEFAULT_AI_CAPABILITIES } from '@/types/aiEditor'
import {
  GLOBAL_NEWSROOM_RULES,
  SHARED_NEWS_STYLE,
  type SeedEditorSpec,
} from './seedEditors'
import {
  CITY_CATEGORY_DESK_CITIES,
  CITY_CATEGORY_DESK_IDS,
  CITY_CATEGORY_DESK_LABEL,
  managedIdsForDesk,
  type CityCategoryDeskId,
} from './seedCityCategoryEditors'
import { scaleJournalistPersona } from './scaleEditorPersona'

export function provinceCategoryEditorSlug(citySlug: string, deskId: CityCategoryDeskId): string {
  return `il-${citySlug.trim().toLowerCase()}-${deskId}`
}

export function buildProvinceCategoryEditorSpec(
  citySlug: string,
  deskId: CityCategoryDeskId
): SeedEditorSpec {
  const city = citySlug.trim().toLowerCase()
  const province = TURKISH_PROVINCES.find((p) => p.slug === city)
  if (!province) throw new Error(`buildProvinceCategoryEditorSpec: il yok: ${citySlug}`)
  const label = CITY_CATEGORY_DESK_LABEL[deskId]
  const managed = managedIdsForDesk(deskId)
  const districts = getDistrictsForProvince(city).map((d) => d.slug)
  const slug = provinceCategoryEditorSlug(city, deskId)
  const persona = scaleJournalistPersona({
    slug,
    deskLabel: `${province.name} ${label}`,
    placeName: province.name,
    layer: 'province',
  })

  return {
    slug,
    name: persona.name,
    title: persona.title,
    shortBio: persona.shortBio,
    bio: persona.bio,
    avatarUrl: persona.avatarUrl,
    coverUrl: persona.coverUrl,
    columnName: null,
    primarySpecialization: `${province.name} ${label}`,
    specializations: [province.name, label],
    categoryIds: managed,
    managedCategories: managed,
    citySlug: city,
    countrySlug: null,
    districtSlug: null,
    editorLayer: 'province',
    personaType: 'local_editor',
    desk: `${province.name} · ${label}`,
    editorialMission: `${province.name} ${label} haberlerinde konum, kurum, zaman ve kaynak net olsun.`,
    tone: 'local',
    temperature: 0.35,
    fallbackEditorSlug: `yerel-${city}`,
    assignableForNews: true,
    localConfig: {
      provinces: [city],
      priorityProvinces: [city],
      districts,
      autoDiscovery: true,
      notes: `SCALE P2 Wave 1 — citySlug=${city}, desk=${deskId}.`,
    },
    capabilities: { ...DEFAULT_AI_CAPABILITIES, columnEnabled: false, breakingEnabled: deskId === 'gundem' },
    prompts: {
      core: `${GLOBAL_NEWSROOM_RULES}

Sen ${persona.name}'sın, NaHaber ${province.name} ${label} masası.
Yalnızca ${province.name} ${label} masasında yaz. İl dışına çıkma; başka kategoriyi bu masaya çekme.
Her haber: NEREDE? HANGİ İLÇE? HANGİ KURUM? NE OLDU? NE ZAMAN? KAYNAK?
Sen bir AI editörsün; sahte insan kimliği / diploma uydurma.`,
      news: `${SHARED_NEWS_STYLE}
Üslup: ${province.name} ${label.toLocaleLowerCase('tr-TR')} gazeteciliği; kurum adları doğru; clickbait yok.`,
      review: `Bu metni ${province.name} ${label} masa standartlarına göre incele: konum, kategori sapması, clickbait, olgu-iddia. PASS | WARNING | BLOCK + kısa gerekçe.`,
    },
  }
}

export function allWave1ProvinceCategorySpecs(): SeedEditorSpec[] {
  const skip = new Set<string>(CITY_CATEGORY_DESK_CITIES)
  return TURKISH_PROVINCES.filter((p) => !skip.has(p.slug)).flatMap((p) =>
    CITY_CATEGORY_DESK_IDS.map((desk) => buildProvinceCategoryEditorSpec(p.slug, desk))
  )
}
