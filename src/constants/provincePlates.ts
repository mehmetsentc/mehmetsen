import { TURKISH_PROVINCES } from '@/constants/cities'

/**
 * Official 01–81 traffic-plate codes keyed by the existing 81-province slugs.
 * Overlay only — not a second province database.
 */
export const PROVINCE_PLATE_BY_SLUG: Readonly<Record<string, string>> = {
  adana: '01',
  adiyaman: '02',
  afyonkarahisar: '03',
  agri: '04',
  amasya: '05',
  ankara: '06',
  antalya: '07',
  artvin: '08',
  aydin: '09',
  balikesir: '10',
  bilecik: '11',
  bingol: '12',
  bitlis: '13',
  bolu: '14',
  burdur: '15',
  bursa: '16',
  canakkale: '17',
  cankiri: '18',
  corum: '19',
  denizli: '20',
  diyarbakir: '21',
  edirne: '22',
  elazig: '23',
  erzincan: '24',
  erzurum: '25',
  eskisehir: '26',
  gaziantep: '27',
  giresun: '28',
  gumushane: '29',
  hakkari: '30',
  hatay: '31',
  isparta: '32',
  mersin: '33',
  istanbul: '34',
  izmir: '35',
  kars: '36',
  kastamonu: '37',
  kayseri: '38',
  kirklareli: '39',
  kirsehir: '40',
  kocaeli: '41',
  konya: '42',
  kutahya: '43',
  malatya: '44',
  manisa: '45',
  kahramanmaras: '46',
  mardin: '47',
  mugla: '48',
  mus: '49',
  nevsehir: '50',
  nigde: '51',
  ordu: '52',
  rize: '53',
  sakarya: '54',
  samsun: '55',
  siirt: '56',
  sinop: '57',
  sivas: '58',
  tekirdag: '59',
  tokat: '60',
  trabzon: '61',
  tunceli: '62',
  sanliurfa: '63',
  usak: '64',
  van: '65',
  yozgat: '66',
  zonguldak: '67',
  aksaray: '68',
  bayburt: '69',
  karaman: '70',
  kirikkale: '71',
  batman: '72',
  sirnak: '73',
  bartin: '74',
  ardahan: '75',
  igdir: '76',
  yalova: '77',
  karabuk: '78',
  kilis: '79',
  osmaniye: '80',
  duzce: '81',
}

const SLUG_BY_PLATE = new Map(
  Object.entries(PROVINCE_PLATE_BY_SLUG).map(([slug, plate]) => [plate, slug])
)

export function getProvincePlate(citySlug: string): string | null {
  return PROVINCE_PLATE_BY_SLUG[citySlug] ?? null
}

export function getProvinceSlugByPlate(plate: string): string | null {
  const normalized = plate.trim().padStart(2, '0')
  return SLUG_BY_PLATE.get(normalized) ?? null
}

/** Dev-time invariant: every official province slug has a plate. */
export function assertPlateCoverage(): boolean {
  return TURKISH_PROVINCES.every((province) => Boolean(PROVINCE_PLATE_BY_SLUG[province.slug]))
}
