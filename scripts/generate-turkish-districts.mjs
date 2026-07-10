/**
 * Generates src/constants/turkishDistricts.ts from TurkiyeAPI.
 * Run: node scripts/generate-turkish-districts.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const TURKISH_CHAR_MAP = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
}

function transliterateTurkish(text) {
  return text.split('').map((ch) => TURKISH_CHAR_MAP[ch] ?? ch).join('')
}

function slugifyDistrict(name) {
  return transliterateTurkish(name.trim().toLocaleLowerCase('tr-TR'))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeName(name) {
  return transliterateTurkish(name.trim().toLocaleLowerCase('tr-TR'))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** slug → display name — must match src/constants/cities.ts TURKISH_PROVINCES */
const PROVINCE_NAMES_BY_SLUG = {
  adana: 'Adana', adiyaman: 'Adıyaman', afyonkarahisar: 'Afyonkarahisar', agri: 'Ağrı', aksaray: 'Aksaray',
  amasya: 'Amasya', ankara: 'Ankara', antalya: 'Antalya', ardahan: 'Ardahan', artvin: 'Artvin',
  aydin: 'Aydın', balikesir: 'Balıkesir', bartin: 'Bartın', batman: 'Batman', bayburt: 'Bayburt',
  bilecik: 'Bilecik', bingol: 'Bingöl', bitlis: 'Bitlis', bolu: 'Bolu', burdur: 'Burdur',
  bursa: 'Bursa', canakkale: 'Çanakkale', cankiri: 'Çankırı', corum: 'Çorum', denizli: 'Denizli',
  diyarbakir: 'Diyarbakır', duzce: 'Düzce', edirne: 'Edirne', elazig: 'Elazığ', erzincan: 'Erzincan',
  erzurum: 'Erzurum', eskisehir: 'Eskişehir', gaziantep: 'Gaziantep', giresun: 'Giresun', gumushane: 'Gümüşhane',
  hakkari: 'Hakkari', hatay: 'Hatay', igdir: 'Iğdır', isparta: 'Isparta', istanbul: 'İstanbul',
  izmir: 'İzmir', kahramanmaras: 'Kahramanmaraş', karabuk: 'Karabük', karaman: 'Karaman', kars: 'Kars',
  kastamonu: 'Kastamonu', kayseri: 'Kayseri', kirikkale: 'Kırıkkale', kirklareli: 'Kırklareli', kirsehir: 'Kırşehir',
  kilis: 'Kilis', kocaeli: 'Kocaeli', konya: 'Konya', kutahya: 'Kütahya', malatya: 'Malatya',
  manisa: 'Manisa', mardin: 'Mardin', mersin: 'Mersin', mugla: 'Muğla', mus: 'Muş',
  nevsehir: 'Nevşehir', nigde: 'Niğde', ordu: 'Ordu', osmaniye: 'Osmaniye', rize: 'Rize',
  sakarya: 'Sakarya', samsun: 'Samsun', siirt: 'Siirt', sinop: 'Sinop', sivas: 'Sivas',
  sanliurfa: 'Şanlıurfa', sirnak: 'Şırnak', tekirdag: 'Tekirdağ', tokat: 'Tokat', trabzon: 'Trabzon',
  tunceli: 'Tunceli', usak: 'Uşak', van: 'Van', yalova: 'Yalova', yozgat: 'Yozgat', zonguldak: 'Zonguldak',
}

const byNormName = new Map(
  Object.entries(PROVINCE_NAMES_BY_SLUG).map(([slug, name]) => [normalizeName(name), slug])
)

const res = await fetch('https://turkiyeapi.dev/api/v1/provinces')
if (!res.ok) throw new Error(`TurkiyeAPI failed: ${res.status}`)
const json = await res.json()
const apiProvinces = json.data

const provinceDistricts = {}
const districtToProvince = {}
const districtDisplay = {}
const missing = []

for (const p of apiProvinces) {
  const slug = byNormName.get(normalizeName(p.name))
  if (!slug) {
    missing.push(p.name)
    continue
  }
  const districts = (p.districts || [])
    .map((d) => {
      const dslug = slugifyDistrict(d.name)
      districtToProvince[dslug] = slug
      districtDisplay[dslug] = d.name
      return { slug: dslug, name: d.name }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  provinceDistricts[slug] = districts
}

if (missing.length) {
  console.warn('Unmatched provinces:', missing)
}

const total = Object.values(provinceDistricts).reduce((n, arr) => n + arr.length, 0)
console.log(`Generated ${Object.keys(provinceDistricts).length} provinces, ${total} districts`)

const out = `/**
 * Turkish province → district lists (973 ilçe / 81 il).
 * Source: TurkiyeAPI (https://turkiyeapi.dev)
 * Regenerate: node scripts/generate-turkish-districts.mjs
 */

export const PROVINCE_DISTRICTS: Readonly<
  Record<string, ReadonlyArray<{ readonly slug: string; readonly name: string }>>
> = ${JSON.stringify(provinceDistricts, null, 2)} as const

export const DISTRICT_TO_PROVINCE_FROM_DATA: Readonly<Record<string, string>> = ${JSON.stringify(districtToProvince, null, 2)} as const

export const DISTRICT_NAMES_FROM_DATA: Readonly<Record<string, string>> = ${JSON.stringify(districtDisplay, null, 2)} as const
`

const target = path.join(ROOT, 'src/constants/turkishDistricts.ts')
fs.writeFileSync(target, out)
console.log('Wrote', target)
