/**
 * Parametric Dünya/ülke editor factory — same pattern as buildCityEditorSpec().
 * Dry-run only in SCALE P1.1: do not add output to allSeedEditorSpecs().
 */

import { DEFAULT_AI_CAPABILITIES } from '@/types/aiEditor'
import {
  GLOBAL_NEWSROOM_RULES,
  SHARED_NEWS_STYLE,
  type SeedEditorSpec,
} from './seedEditors'
import { countryEditorSlug } from './editorHierarchy'
import { scaleJournalistPersona } from './scaleEditorPersona'

export const COUNTRY_EDITOR_CATEGORY_KEYS = [
  'genel',
  'politika',
  'ekonomi',
  'spor',
  'teknoloji',
  'saglik',
  'kultur',
  'cevre',
] as const

export type CountryEditorCategoryKey = (typeof COUNTRY_EDITOR_CATEGORY_KEYS)[number]

export const COUNTRY_EDITOR_CATEGORY_META: Record<
  CountryEditorCategoryKey,
  { categoryId: string; label: string }
> = {
  genel: { categoryId: 'dunya', label: 'Genel' },
  politika: { categoryId: 'siyaset', label: 'Politika' },
  ekonomi: { categoryId: 'ekonomi', label: 'Ekonomi' },
  spor: { categoryId: 'spor', label: 'Spor' },
  teknoloji: { categoryId: 'teknoloji', label: 'Teknoloji-Bilim' },
  saglik: { categoryId: 'saglik', label: 'Sağlık' },
  kultur: { categoryId: 'kultur', label: 'Kültür-Sanat' },
  cevre: { categoryId: 'cevre-iklim', label: 'Çevre' },
}

export interface CountryEditorInput {
  countryCode?: string
  countryNameTr: string
  category?: CountryEditorCategoryKey
  /** WORLD_COUNTRIES slug (ispanya, abd). Preferred for live routing. */
  worldSlug?: string
}

export function buildCountryEditorSpec(input: CountryEditorInput): SeedEditorSpec {
  const world = input.worldSlug?.trim().toLowerCase()
  const iso = input.countryCode?.trim().toLowerCase()
  if (world) {
    if (!/^[a-z0-9-]{2,40}$/.test(world)) {
      throw new Error(`buildCountryEditorSpec: worldSlug geçersiz, gelen=${input.worldSlug}`)
    }
  } else if (!iso || !/^[a-z]{2}$/.test(iso)) {
    throw new Error(`buildCountryEditorSpec: countryCode ISO-2 olmalı, gelen=${input.countryCode}`)
  }
  const code = world || iso!
  const nameTr = input.countryNameTr.trim()
  const categoryKey = input.category ?? 'genel'
  const meta = COUNTRY_EDITOR_CATEGORY_META[categoryKey]
  const isGeneral = categoryKey === 'genel'
  const slug = countryEditorSlug(code, isGeneral ? null : categoryKey)
  const deskLabel = isGeneral ? `${nameTr} Dünya` : `${nameTr} ${meta.label}`
  const categoryIds = isGeneral ? ['dunya'] : [meta.categoryId]
  const fallback = isGeneral ? 'defne-aksoy' : countryEditorSlug(code)
  const persona = scaleJournalistPersona({
    slug,
    deskLabel,
    placeName: nameTr,
    layer: 'country',
    countryKey: code,
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
    primarySpecialization: deskLabel,
    specializations: [nameTr, meta.label, 'Dünya'],
    categoryIds,
    managedCategories: categoryIds,
    citySlug: null,
    countrySlug: code,
    districtSlug: null,
    editorLayer: 'country',
    personaType: 'desk_editor',
    desk: `Dünya · ${deskLabel}`,
    editorialMission: `${nameTr} haberinde ülke, kurum, zaman ve kaynak net olsun; başka ülkeyi bu masaya çekme.`,
    tone: 'international',
    temperature: 0.35,
    fallbackEditorSlug: fallback,
    assignableForNews: true,
    capabilities: { ...DEFAULT_AI_CAPABILITIES, columnEnabled: false },
    prompts: {
      core: `${GLOBAL_NEWSROOM_RULES}

Sen ${persona.name}'sın, NaHaber Dünya masasının ${nameTr} kolu (${deskLabel}).
Uzmanlık: ${nameTr}${isGeneral ? '' : ` / ${meta.label}`}.
- Ülke adını ve resmi kurumları doğru yaz; başka ülkeye sapma.
- "iddia edildi" düzeyini "oldu" yapma.
- Ulusal önemdeyse Dünya masasına (defne-aksoy) yükseltme bayrağı koy.
Sen bir AI editörsün; sahte insan kimliği / diploma uydurma.`,
      news: `${SHARED_NEWS_STYLE}
Üslup: ${nameTr} odaklı uluslararası gazetecilik; ülke adı doğal; clickbait yok.`,
      review: `Bu metni ${nameTr} ${meta.label} masa standartlarına göre incele: ülke doğruluğu, olgu-iddia, clickbait. PASS | WARNING | BLOCK + kısa gerekçe.`,
    },
  }
}

/** SCALE P1.1 dry-run set — 3 countries, not the full ISO grid. */
export const SCALE_P1_1_COUNTRY_DRYRUN: CountryEditorInput[] = [
  { countryCode: 'ES', countryNameTr: 'İspanya' },
  { countryCode: 'DE', countryNameTr: 'Almanya', category: 'politika' },
  { countryCode: 'US', countryNameTr: 'ABD', category: 'spor' },
]

/** WAVE 3 — top 15 countrySlug values from dunya news (90g sample, TASK 0). */
export const SCALE_P2_WAVE3_COUNTRIES: { worldSlug: string; countryNameTr: string }[] = [
  { worldSlug: 'abd', countryNameTr: 'ABD' },
  { worldSlug: 'iran', countryNameTr: 'İran' },
  { worldSlug: 'rusya', countryNameTr: 'Rusya' },
  { worldSlug: 'israil', countryNameTr: 'İsrail' },
  { worldSlug: 'almanya', countryNameTr: 'Almanya' },
  { worldSlug: 'fransa', countryNameTr: 'Fransa' },
  { worldSlug: 'ukrayna', countryNameTr: 'Ukrayna' },
  { worldSlug: 'birlesik-krallik', countryNameTr: 'Birleşik Krallık' },
  { worldSlug: 'nepal', countryNameTr: 'Nepal' },
  { worldSlug: 'hindistan', countryNameTr: 'Hindistan' },
  { worldSlug: 'filistin', countryNameTr: 'Filistin' },
  { worldSlug: 'italya', countryNameTr: 'İtalya' },
  { worldSlug: 'yunanistan', countryNameTr: 'Yunanistan' },
  { worldSlug: 'ispanya', countryNameTr: 'İspanya' },
  { worldSlug: 'japonya', countryNameTr: 'Japonya' },
]

export function allWave3CountrySpecs(): SeedEditorSpec[] {
  return SCALE_P2_WAVE3_COUNTRIES.flatMap((c) =>
    COUNTRY_EDITOR_CATEGORY_KEYS.map((category) =>
      buildCountryEditorSpec({
        worldSlug: c.worldSlug,
        countryNameTr: c.countryNameTr,
        category,
      })
    )
  )
}
