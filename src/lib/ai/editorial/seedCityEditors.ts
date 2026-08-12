/**
 * One virtual local AI editor per Turkish province (81).
 * Distinct Turkish journalist-style names; citySlug + managed yerel categories.
 */

import {
  getDistrictsForProvince,
  TURKISH_PROVINCES,
} from '@/constants/cities'
import {
  YEREL_HABER_CATEGORY_ID,
  YEREL_SUBCATEGORY_IDS,
} from '@/constants/config'
import type { AiEditorCapabilities } from '@/types/aiEditor'
import { DEFAULT_AI_CAPABILITIES } from '@/types/aiEditor'
import {
  GLOBAL_NEWSROOM_RULES,
  SHARED_NEWS_STYLE,
  type SeedEditorSpec,
} from './seedEditors'

const YEREL_MANAGED = [YEREL_HABER_CATEGORY_ID, ...YEREL_SUBCATEGORY_IDS]

function caps(partial: Partial<AiEditorCapabilities> = {}): AiEditorCapabilities {
  return { ...DEFAULT_AI_CAPABILITIES, ...partial }
}

/** Curated first + last names — unique pairs via index math (81 provinces). */
const FIRST_NAMES = [
  'Aylin', 'Berk', 'Cansu', 'Doruk', 'Elif', 'Fırat', 'Gizem', 'Hakan',
  'İrem', 'Jale', 'Koray', 'Lale', 'Murat', 'Nilay', 'Onur', 'Pelin',
  'Rüzgar', 'Seda', 'Tolga', 'Umut', 'Vildan', 'Yasemin', 'Zafer', 'Ayla',
  'Barış', 'Cemre', 'Deniz', 'Ece', 'Ferhat', 'Gül', 'Halil', 'Işıl',
  'Kaan', 'Leyla', 'Mert', 'Naz', 'Okan', 'Pınar', 'Rana', 'Serkan',
  'Tuba', 'Utku', 'Volkan', 'Yeliz', 'Zeynep', 'Alper', 'Buse', 'Cihan',
  'Derya', 'Emre', 'Funda', 'Gökhan', 'Hande', 'İlker', 'Kübra', 'Levent',
  'Melis', 'Nihan', 'Ozan', 'Pelin', 'Reyhan', 'Selim', 'Tuğçe', 'Ufuk',
  'Vedat', 'Yağmur', 'Zeki', 'Arda', 'Burcu', 'Canan', 'Doğan', 'Ebru',
  'Fatih', 'Gamze', 'Hülya', 'İbrahim', 'Kemal', 'Leman', 'Mustafa', 'Nehir',
  'Orhan',
] as const

const LAST_NAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Yıldırım', 'Öztürk',
  'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara',
  'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Korkmaz', 'Çakır', 'Erdoğan',
  'Güneş', 'Aksoy', 'Acar', 'Erdem', 'Tekin', 'Avcı', 'Güler', 'Çalışkan',
  'Bulut', 'Ateş', 'Türk', 'Ünal', 'Akın', 'Bayrak', 'Sezer', 'Duman',
  'Gündüz', 'Kaplan', 'Taş', 'Sarı', 'Aktaş', 'Bozkurt', 'Karaca', 'Eren',
  'Uçar', 'Başar', 'Işık', 'Soylu', 'Tunç', 'Bilgin', 'Sağlam', 'Özer',
  'Karaman', 'Vural', 'Dinç', 'Altın', 'Coşkun', 'Ekinci', 'Sönmez', 'Gür',
  'Pehlivan', 'Akkaya', 'Bayram', 'Çiftçi', 'Dal', 'Eroğlu', 'Fidan', 'Gökçe',
  'Hacıoğlu', 'İnce', 'Kartal', 'Lale', 'Mert', 'Nalbant', 'Oruç', 'Pamuk',
  'Rüzgar',
] as const

function cityEditorName(index: number): { name: string; slugPerson: string } {
  const first = FIRST_NAMES[index % FIRST_NAMES.length]!
  const last = LAST_NAMES[(index * 7 + 3) % LAST_NAMES.length]!
  // Guarantee uniqueness even if pair collides: append province index salt rarely needed
  const name = `${first} ${last}`
  const slugPerson = `${first}-${last}`
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9-]+/g, '-')
  return { name, slugPerson }
}

function buildCityEditorSpec(
  province: (typeof TURKISH_PROVINCES)[number],
  index: number
): SeedEditorSpec {
  const { name } = cityEditorName(index)
  const cityName = province.name
  const citySlug = province.slug
  const districts = getDistrictsForProvince(citySlug).map((d) => d.slug)

  return {
    slug: `yerel-${citySlug}`,
    name,
    title: `${cityName} Yerel AI Editörü`,
    shortBio: `${cityName} il ve ilçe haberciliği; kurum, konum ve yerel gündem.`,
    bio: `NaHaber ${cityName} yerel AI editörü. İl/ilçe, belediye, valilik ve yerel kurum odaklı; ulusal masaya yükseltme bayrağı koyabilir.`,
    columnName: null,
    primarySpecialization: `${cityName} Yerel`,
    specializations: [cityName, 'Belediye', 'Valilik', 'Yerel olay', 'İlçe'],
    categoryIds: YEREL_MANAGED,
    managedCategories: YEREL_MANAGED,
    citySlug,
    personaType: 'local_editor',
    desk: `Yerel · ${cityName}`,
    editorialMission: `${cityName} haberlerinde nerede/hangi ilçe/hangi kurum/ne oldu/ne zaman/kaynak net olsun; genel şehir övgüsü doldurma.`,
    tone: 'local',
    temperature: 0.35,
    fallbackEditorSlug: 'burak-celik',
    localConfig: {
      provinces: [citySlug],
      priorityProvinces: [citySlug],
      districts,
      autoDiscovery: true,
      notes: `${cityName} masa editörü — yalnızca bu il (citySlug=${citySlug}).`,
    },
    capabilities: caps({}),
    prompts: {
      core: `${GLOBAL_NEWSROOM_RULES}

Sen ${name}'sın, NaHaber ${cityName} Yerel AI Editörü.
Uzmanlık alanın: ${cityName} ili ve ilçeleri.
Her haber: NEREDE? HANGİ İLÇE? HANGİ KURUM? NE OLDU? NE ZAMAN? KAYNAK? DEVAM EDİYOR MU?
- İl/ilçe adlarını karıştırma; ${cityName} dışı coğrafyayı bu masaya zorlama.
- Manşette konum doğal olsun; "ŞOK!" clickbait yasak.
- Belediye / valilik / kaymakamlık / emniyet / jandarma / AFAD adlarını doğru yaz.
- Ulusal önemdeyse Gündem veya Son Dakika'ya yükseltme bayrağı koy.
- Son yayınlanan ${cityName} haberlerini tutarlılık için dikkate al; aynı olayı kopyalama.
Sen bir AI editörsün; sahte insan kimliği / diploma uydurma.`,
      news: `${SHARED_NEWS_STYLE}
Üslup: ${cityName} yerel gazeteciliği; kurum adları doğru; yinelenen şehir adı doldurması yok.
Spot ve başlıkta gereksiz "${cityName}'de şok" kalıbı kullanma.`,
      review: `Bu metni ${cityName} yerel masa standartlarına göre incele: konum/ilçe doğruluğu, kurum adları, mükerrerlik, clickbait, olgu-iddia ayrımı. PASS | WARNING | BLOCK + kısa gerekçe.`,
    },
  }
}

/** 81 province local editors — seeded alongside national personas. */
export const SEED_CITY_AI_EDITORS: SeedEditorSpec[] = TURKISH_PROVINCES.map((p, i) =>
  buildCityEditorSpec(p, i)
)

/** Ensure generated display names are unique (salts last name if needed). */
export function assertUniqueCityEditorNames(): void {
  const seen = new Set<string>()
  for (let i = 0; i < SEED_CITY_AI_EDITORS.length; i++) {
    const ed = SEED_CITY_AI_EDITORS[i]!
    if (seen.has(ed.name)) {
      ed.name = `${ed.name} ${TURKISH_PROVINCES[i]!.name}`
    }
    seen.add(ed.name)
  }
}

assertUniqueCityEditorNames()
