/**
 * Parametric ilçe editor factory — data from turkishDistricts.ts (973/81).
 * Dry-run only in SCALE P1.1: do not add output to allSeedEditorSpecs().
 */

import { TURKISH_PROVINCES } from '@/constants/cities'
import { PROVINCE_DISTRICTS } from '@/constants/turkishDistricts'
import { DEFAULT_AI_CAPABILITIES } from '@/types/aiEditor'
import {
  GLOBAL_NEWSROOM_RULES,
  SHARED_NEWS_STYLE,
  type SeedEditorSpec,
} from './seedEditors'
import { districtEditorSlug } from './editorHierarchy'
import { scaleJournalistPersona } from './scaleEditorPersona'

export interface DistrictEditorInput {
  provinceSlug: string
  districtSlug: string
  /** Optional desk key (e.g. spor, gundem). Omit for ilçe-genel yönetici. */
  category?: string
}

const DISTRICT_CATEGORY_LABEL: Record<string, string> = {
  gundem: 'Güncel',
  siyaset: 'Siyaset',
  asayis: '3. Sayfa',
  ekonomi: 'Ekonomi',
  spor: 'Spor',
  yasam: 'Yaşam',
  egitim: 'Eğitim',
  kultur: 'Kültür Sanat',
  turizm: 'Turizm',
}

export function buildDistrictEditorSpec(input: DistrictEditorInput): SeedEditorSpec {
  const provinceSlug = input.provinceSlug.trim().toLowerCase()
  const districtSlug = input.districtSlug.trim().toLowerCase()
  const districts = PROVINCE_DISTRICTS[provinceSlug]
  if (!districts) {
    throw new Error(`buildDistrictEditorSpec: il yok: ${provinceSlug}`)
  }
  const district = districts.find((d) => d.slug === districtSlug)
  if (!district) {
    throw new Error(`buildDistrictEditorSpec: ilçe yok: ${provinceSlug}/${districtSlug}`)
  }
  const provinceName = TURKISH_PROVINCES.find((p) => p.slug === provinceSlug)?.name ?? provinceSlug
  const categoryKey = input.category?.trim().toLowerCase() || null
  const categoryLabel = categoryKey ? DISTRICT_CATEGORY_LABEL[categoryKey] ?? categoryKey : null
  const slug = districtEditorSlug(provinceSlug, districtSlug, categoryKey)
  const isGeneral = !categoryKey
  const deskLabel = isGeneral
    ? `${district.name} (${provinceName})`
    : `${district.name} ${categoryLabel}`
  const categoryIds = isGeneral ? ['yerel-haber'] : [categoryKey]
  const fallback = isGeneral ? `yerel-${provinceSlug}` : districtEditorSlug(provinceSlug, districtSlug)
  const persona = scaleJournalistPersona({
    slug,
    deskLabel,
    placeName: `${provinceName} / ${district.name}`,
    layer: 'district',
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
    specializations: [provinceName, district.name, categoryLabel ?? 'İlçe'].filter(Boolean) as string[],
    categoryIds,
    managedCategories: categoryIds,
    citySlug: provinceSlug,
    countrySlug: null,
    districtSlug,
    editorLayer: 'district',
    personaType: 'local_editor',
    desk: `İlçe · ${deskLabel}`,
    editorialMission: `${district.name} haberinde ilçe, kurum, zaman ve kaynak net olsun; başka ilçeyi bu masaya çekme.`,
    tone: 'local',
    temperature: 0.35,
    fallbackEditorSlug: fallback,
    assignableForNews: true,
    localConfig: {
      provinces: [provinceSlug],
      priorityProvinces: [provinceSlug],
      districts: [districtSlug],
      autoDiscovery: true,
      notes: `İlçe masa — ${provinceSlug}/${districtSlug}${categoryKey ? ` desk=${categoryKey}` : ''}.`,
    },
    capabilities: { ...DEFAULT_AI_CAPABILITIES, columnEnabled: false },
    prompts: {
      core: `${GLOBAL_NEWSROOM_RULES}

Sen ${persona.name}'sın, NaHaber ${provinceName} ${district.name} ilçe masası.
Uzmanlık: ${district.name} ilçesi${categoryLabel ? ` / ${categoryLabel}` : ''}.
Her haber: NEREDE? HANGİ İLÇE? HANGİ KURUM? NE OLDU? NE ZAMAN? KAYNAK?
- ${district.name} dışındaki ilçeleri bu masaya zorlama.
- İl genelindeyse yerel-${provinceSlug} yükseltme bayrağı koy.
Sen bir AI editörsün; sahte insan kimliği / diploma uydurma.`,
      news: `${SHARED_NEWS_STYLE}
Üslup: ${district.name} yerel gazeteciliği; kurum adları doğru; "${district.name}'de şok" kalıbı yok.`,
      review: `Bu metni ${district.name} ilçe masa standartlarına göre incele: ilçe doğruluğu, kurum, clickbait, olgu-iddia. PASS | WARNING | BLOCK + kısa gerekçe.`,
    },
  }
}

/** SCALE P1.1 dry-run set — 3 Çanakkale districts, not the 973 grid. */
export const SCALE_P1_1_DISTRICT_DRYRUN: DistrictEditorInput[] = [
  { provinceSlug: 'canakkale', districtSlug: 'biga' },
  { provinceSlug: 'canakkale', districtSlug: 'gelibolu', category: 'spor' },
  { provinceSlug: 'canakkale', districtSlug: 'merkez', category: 'gundem' },
]

export function allWave2DistrictGeneralSpecs(): SeedEditorSpec[] {
  const out: SeedEditorSpec[] = []
  for (const [provinceSlug, districts] of Object.entries(PROVINCE_DISTRICTS)) {
    for (const d of districts) {
      out.push(buildDistrictEditorSpec({ provinceSlug, districtSlug: d.slug }))
    }
  }
  return out
}
