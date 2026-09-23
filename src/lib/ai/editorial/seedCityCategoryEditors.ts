/**
 * One AI editor persona per city Feed category for live city tenants
 * (Çanakkale, Antalya). Display names are unique journalists-style identities;
 * slugs power /yazar/[slug] profiles.
 */

import { getDistrictsForProvince, TURKISH_PROVINCES } from '@/constants/cities'
import { getCategoryFamily } from '@/constants/config'
import type { AiEditorCapabilities } from '@/types/aiEditor'
import { DEFAULT_AI_CAPABILITIES } from '@/types/aiEditor'
import {
  GLOBAL_NEWSROOM_RULES,
  SHARED_NEWS_STYLE,
  type SeedEditorSpec,
} from './seedEditors'
import { withEditorMedia } from './scaleEditorPersona'

export const CITY_CATEGORY_DESK_CITIES = ['canakkale', 'antalya'] as const
export type CityCategoryDeskCity = (typeof CITY_CATEGORY_DESK_CITIES)[number]

export const CITY_CATEGORY_DESK_IDS = [
  'gundem',
  'siyaset',
  'asayis',
  'ekonomi',
  'yasam',
  'egitim',
  'kultur',
  'turizm',
  'spor',
  'yerel-duyuru',
] as const
export type CityCategoryDeskId = (typeof CITY_CATEGORY_DESK_IDS)[number]

export const CITY_CATEGORY_DESK_LABEL: Record<CityCategoryDeskId, string> = {
  gundem: 'Güncel',
  siyaset: 'Siyaset',
  asayis: '3. Sayfa',
  ekonomi: 'Ekonomi',
  yasam: 'Yaşam',
  egitim: 'Eğitim',
  kultur: 'Kültür Sanat',
  turizm: 'Turizm',
  spor: 'Spor',
  'yerel-duyuru': 'Duyuru',
}

/** Extra ids that should sit on the same city desk as the chip category. */
const DESK_EXTRA_IDS: Partial<Record<CityCategoryDeskId, readonly string[]>> = {
  gundem: ['son-dakika', 'trend'],
}

const PERSONAS: Record<
  CityCategoryDeskCity,
  Record<CityCategoryDeskId, { name: string; slug: string }>
> = {
  canakkale: {
    gundem: { name: 'Nisa Korhan', slug: 'nisa-korhan' },
    siyaset: { name: 'Tarık Akbay', slug: 'tarik-akbay' },
    asayis: { name: 'Eren Soysal', slug: 'eren-soysal' },
    ekonomi: { name: 'Melike Tuna', slug: 'melike-tuna' },
    yasam: { name: 'Ceren Akkılıç', slug: 'ceren-akkilic' },
    egitim: { name: 'Beril Yurtseven', slug: 'beril-yurtseven' },
    kultur: { name: 'Sinan Aladağ', slug: 'sinan-aladag' },
    turizm: { name: 'Aslıhan Kepez', slug: 'aslihan-kepez' },
    spor: { name: 'Yiğit Anafarta', slug: 'yigit-anafarta' },
    'yerel-duyuru': { name: 'Gökçe Truva', slug: 'gokce-truva' },
  },
  antalya: {
    gundem: { name: 'Lara Kumral', slug: 'lara-kumral' },
    siyaset: { name: 'Kaan Serik', slug: 'kaan-serik' },
    asayis: { name: 'Baran Kale', slug: 'baran-kale' },
    ekonomi: { name: 'Sibel Manavgat', slug: 'sibel-manavgat' },
    yasam: { name: 'Eylül Belek', slug: 'eylul-belek' },
    egitim: { name: 'Onur Aksu', slug: 'onur-aksu' },
    kultur: { name: 'Mira Perge', slug: 'mira-perge' },
    turizm: { name: 'Defne Side', slug: 'defne-side' },
    spor: { name: 'Bora Alanya', slug: 'bora-alanya' },
    'yerel-duyuru': { name: 'Nazlı Kaleiçi', slug: 'nazli-kaleici' },
  },
}

function caps(partial: Partial<AiEditorCapabilities> = {}): AiEditorCapabilities {
  return { ...DEFAULT_AI_CAPABILITIES, ...partial }
}

function provinceName(citySlug: string): string {
  return TURKISH_PROVINCES.find((p) => p.slug === citySlug)?.name ?? citySlug
}

export function managedIdsForDesk(deskId: CityCategoryDeskId): string[] {
  const family = getCategoryFamily(deskId)
  const extras = DESK_EXTRA_IDS[deskId] ?? []
  return [...new Set([...family, deskId, ...extras])]
}

function buildDeskSpec(citySlug: CityCategoryDeskCity, deskId: CityCategoryDeskId): SeedEditorSpec {
  const cityName = provinceName(citySlug)
  const persona = PERSONAS[citySlug][deskId]
  const label = CITY_CATEGORY_DESK_LABEL[deskId]
  const managed = managedIdsForDesk(deskId)
  const districts = getDistrictsForProvince(citySlug).map((d) => d.slug)

  return {
    slug: persona.slug,
    name: persona.name,
    title: `${cityName} ${label} editörü`,
    shortBio: `${cityName} ${label.toLocaleLowerCase('tr-TR')} masası; yalnızca bu il ve bu kategori.`,
    bio: `NaHaber ${cityName} ${label} AI editörü. ${cityName} haberlerini ${label.toLocaleLowerCase('tr-TR')} masasında yazar; kaynak adı değil, bu masa kimliği byline'da görünür.`,
    columnName: null,
    primarySpecialization: `${cityName} ${label}`,
    specializations: [cityName, label],
    categoryIds: managed,
    managedCategories: managed,
    citySlug,
    personaType: 'local_editor',
    desk: `${cityName} · ${label}`,
    editorialMission: `${cityName} ${label} haberlerinde konum, kurum, zaman ve kaynak net olsun; başka masanın dilini taklit etme.`,
    tone: 'local',
    temperature: 0.35,
    fallbackEditorSlug: `yerel-${citySlug}`,
    localConfig: {
      provinces: [citySlug],
      priorityProvinces: [citySlug],
      districts,
      autoDiscovery: true,
      notes: `${cityName} ${label} masa editörü — citySlug=${citySlug}, desk=${deskId}.`,
    },
    capabilities: caps({ breakingEnabled: deskId === 'gundem' }),
    prompts: {
      core: `${GLOBAL_NEWSROOM_RULES}

Sen ${persona.name}'sın, NaHaber ${cityName} ${label} AI Editörü.
Yalnızca ${cityName} ${label} masasında yaz. İl dışına çıkma; başka kategoriyi bu masaya çekme.
Her haber: NEREDE? HANGİ İLÇE? HANGİ KURUM? NE OLDU? NE ZAMAN? KAYNAK?
Sen bir AI editörsün; sahte insan kimliği / diploma uydurma.`,
      news: `${SHARED_NEWS_STYLE}
Üslup: ${cityName} ${label.toLocaleLowerCase('tr-TR')} gazeteciliği; kurum adları doğru; clickbait yok.`,
      review: `Bu metni ${cityName} ${label} masa standartlarına göre incele: konum, kategori sapması, clickbait, olgu-iddia. PASS | WARNING | BLOCK + kısa gerekçe.`,
    },
  }
}

export const SEED_CITY_CATEGORY_AI_EDITORS: SeedEditorSpec[] = CITY_CATEGORY_DESK_CITIES.flatMap((city) =>
  CITY_CATEGORY_DESK_IDS.map((desk) => withEditorMedia(buildDeskSpec(city, desk)))
)

export function isCityCategoryDeskCity(citySlug?: string | null): citySlug is CityCategoryDeskCity {
  const city = citySlug?.trim().toLowerCase()
  return CITY_CATEGORY_DESK_CITIES.some((item) => item === city)
}

export function findCityCategoryEditorSpec(
  citySlug?: string | null,
  categoryId?: string | null
): SeedEditorSpec | null {
  const city = citySlug?.trim().toLowerCase()
  const category = categoryId?.trim().toLowerCase()
  if (!city || !category || !isCityCategoryDeskCity(city)) return null
  return (
    SEED_CITY_CATEGORY_AI_EDITORS.find((editor) => {
      if (editor.citySlug !== city) return false
      const managed = editor.managedCategories?.length ? editor.managedCategories : editor.categoryIds
      return managed.includes(category)
    }) ?? null
  )
}

export function findCityCategoryEditorBySlug(slug?: string | null): SeedEditorSpec | null {
  const key = slug?.trim().toLowerCase()
  if (!key) return null
  return SEED_CITY_CATEGORY_AI_EDITORS.find((editor) => editor.slug === key) ?? null
}

export function findCityCategoryEditorByAuthorUid(authorUid?: string | null): SeedEditorSpec | null {
  const uid = authorUid?.trim()
  if (!uid) return null
  const slug = uid.startsWith('ai_editor_') ? uid.slice('ai_editor_'.length) : uid
  return findCityCategoryEditorBySlug(slug)
}
