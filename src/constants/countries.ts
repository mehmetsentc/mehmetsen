export interface WorldCountry {
  slug: string
  name: string
}

/**
 * Dünya haberleri ülke listesi (Türkçe).
 * BM üyeleri + sık geçen bölgeler (Filistin, Kosova, Tayvan).
 * Alfabetik (tr-TR).
 */
export const WORLD_COUNTRIES: WorldCountry[] = [
  { slug: 'abd', name: 'ABD' },
  { slug: 'afganistan', name: 'Afganistan' },
  { slug: 'almanya', name: 'Almanya' },
  { slug: 'andorra', name: 'Andorra' },
  { slug: 'angola', name: 'Angola' },
  { slug: 'antigua-ve-barbuda', name: 'Antigua ve Barbuda' },
  { slug: 'arjantin', name: 'Arjantin' },
  { slug: 'arnavutluk', name: 'Arnavutluk' },
  { slug: 'avustralya', name: 'Avustralya' },
  { slug: 'avusturya', name: 'Avusturya' },
  { slug: 'azerbaycan', name: 'Azerbaycan' },
  { slug: 'bahamalar', name: 'Bahamalar' },
  { slug: 'bahreyn', name: 'Bahreyn' },
  { slug: 'banglades', name: 'Bangladeş' },
  { slug: 'barbados', name: 'Barbados' },
  { slug: 'belarus', name: 'Belarus' },
  { slug: 'belcika', name: 'Belçika' },
  { slug: 'belize', name: 'Belize' },
  { slug: 'benin', name: 'Benin' },
  { slug: 'bhutan', name: 'Bhutan' },
  { slug: 'birlesik-arap-emirlikleri', name: 'Birleşik Arap Emirlikleri' },
  { slug: 'birlesik-krallik', name: 'Birleşik Krallık' },
  { slug: 'bolivya', name: 'Bolivya' },
  { slug: 'bosna-hersek', name: 'Bosna-Hersek' },
  { slug: 'botsvana', name: 'Botsvana' },
  { slug: 'brezilya', name: 'Brezilya' },
  { slug: 'brunei', name: 'Brunei' },
  { slug: 'bulgaristan', name: 'Bulgaristan' },
  { slug: 'burkina-faso', name: 'Burkina Faso' },
  { slug: 'burundi', name: 'Burundi' },
  { slug: 'cezayir', name: 'Cezayir' },
  { slug: 'cibuti', name: 'Cibuti' },
  { slug: 'cad', name: 'Çad' },
  { slug: 'cekya', name: 'Çekya' },
  { slug: 'cin', name: 'Çin' },
  { slug: 'danimarka', name: 'Danimarka' },
  { slug: 'dominik-cumhuriyeti', name: 'Dominik Cumhuriyeti' },
  { slug: 'dominika', name: 'Dominika' },
  { slug: 'ekvador', name: 'Ekvador' },
  { slug: 'ekvator-ginesi', name: 'Ekvator Ginesi' },
  { slug: 'el-salvador', name: 'El Salvador' },
  { slug: 'endonezya', name: 'Endonezya' },
  { slug: 'eritrea', name: 'Eritre' },
  { slug: 'ermenistan', name: 'Ermenistan' },
  { slug: 'estonya', name: 'Estonya' },
  { slug: 'esvatini', name: 'Esvatini' },
  { slug: 'etyopya', name: 'Etiyopya' },
  { slug: 'fas', name: 'Fas' },
  { slug: 'fiji', name: 'Fiji' },
  { slug: 'fildisi-sahili', name: 'Fildişi Sahili' },
  { slug: 'filipinler', name: 'Filipinler' },
  { slug: 'filistin', name: 'Filistin' },
  { slug: 'finlandiya', name: 'Finlandiya' },
  { slug: 'fransa', name: 'Fransa' },
  { slug: 'gabon', name: 'Gabon' },
  { slug: 'gambiya', name: 'Gambiya' },
  { slug: 'gana', name: 'Gana' },
  { slug: 'gine', name: 'Gine' },
  { slug: 'gine-bissau', name: 'Gine-Bissau' },
  { slug: 'grenada', name: 'Grenada' },
  { slug: 'guatemala', name: 'Guatemala' },
  { slug: 'guyana', name: 'Guyana' },
  { slug: 'guney-afrika', name: 'Güney Afrika' },
  { slug: 'guney-kore', name: 'Güney Kore' },
  { slug: 'guney-sudan', name: 'Güney Sudan' },
  { slug: 'gurcistan', name: 'Gürcistan' },
  { slug: 'haiti', name: 'Haiti' },
  { slug: 'hindistan', name: 'Hindistan' },
  { slug: 'hirvatistan', name: 'Hırvatistan' },
  { slug: 'hollanda', name: 'Hollanda' },
  { slug: 'honduras', name: 'Honduras' },
  { slug: 'irak', name: 'Irak' },
  { slug: 'iran', name: 'İran' },
  { slug: 'irlanda', name: 'İrlanda' },
  { slug: 'ispanya', name: 'İspanya' },
  { slug: 'israil', name: 'İsrail' },
  { slug: 'isvec', name: 'İsveç' },
  { slug: 'isvicre', name: 'İsviçre' },
  { slug: 'italya', name: 'İtalya' },
  { slug: 'izlanda', name: 'İzlanda' },
  { slug: 'jamaika', name: 'Jamaika' },
  { slug: 'japonya', name: 'Japonya' },
  { slug: 'kambocya', name: 'Kamboçya' },
  { slug: 'kamerun', name: 'Kamerun' },
  { slug: 'kanada', name: 'Kanada' },
  { slug: 'karadag', name: 'Karadağ' },
  { slug: 'katar', name: 'Katar' },
  { slug: 'kazakistan', name: 'Kazakistan' },
  { slug: 'kenya', name: 'Kenya' },
  { slug: 'kibris', name: 'Kıbrıs' },
  { slug: 'kirgizistan', name: 'Kırgızistan' },
  { slug: 'kiribati', name: 'Kiribati' },
  { slug: 'kolombiya', name: 'Kolombiya' },
  { slug: 'komorlar', name: 'Komorlar' },
  { slug: 'kongo-cumhuriyeti', name: 'Kongo Cumhuriyeti' },
  { slug: 'kongo-demokratik-cumhuriyeti', name: 'Kongo Demokratik Cumhuriyeti' },
  { slug: 'kosta-rika', name: 'Kosta Rika' },
  { slug: 'kosova', name: 'Kosova' },
  { slug: 'kuba', name: 'Küba' },
  { slug: 'kuveyt', name: 'Kuveyt' },
  { slug: 'kuzey-kore', name: 'Kuzey Kore' },
  { slug: 'kuzey-makedonya', name: 'Kuzey Makedonya' },
  { slug: 'laos', name: 'Laos' },
  { slug: 'lesotho', name: 'Lesotho' },
  { slug: 'letoniya', name: 'Letonya' },
  { slug: 'liberya', name: 'Liberya' },
  { slug: 'libya', name: 'Libya' },
  { slug: 'lihtenstayn', name: 'Lihtenştayn' },
  { slug: 'litvanya', name: 'Litvanya' },
  { slug: 'lubnan', name: 'Lübnan' },
  { slug: 'luksemburg', name: 'Lüksemburg' },
  { slug: 'macaristan', name: 'Macaristan' },
  { slug: 'madagaskar', name: 'Madagaskar' },
  { slug: 'makedonya', name: 'Makedonya' },
  { slug: 'malawi', name: 'Malavi' },
  { slug: 'maldivler', name: 'Maldivler' },
  { slug: 'malezya', name: 'Malezya' },
  { slug: 'mali', name: 'Mali' },
  { slug: 'malta', name: 'Malta' },
  { slug: 'marshall-adalari', name: 'Marshall Adaları' },
  { slug: 'mauritius', name: 'Mauritius' },
  { slug: 'meksika', name: 'Meksika' },
  { slug: 'misir', name: 'Mısır' },
  { slug: 'mikronezya', name: 'Mikronezya' },
  { slug: 'mogolistan', name: 'Moğolistan' },
  { slug: 'moldova', name: 'Moldova' },
  { slug: 'monako', name: 'Monako' },
  { slug: 'moritanya', name: 'Moritanya' },
  { slug: 'mozambik', name: 'Mozambik' },
  { slug: 'myanmar', name: 'Myanmar' },
  { slug: 'namibya', name: 'Namibya' },
  { slug: 'nauru', name: 'Nauru' },
  { slug: 'nepal', name: 'Nepal' },
  { slug: 'nijer', name: 'Nijer' },
  { slug: 'nijerya', name: 'Nijerya' },
  { slug: 'nikaragua', name: 'Nikaragua' },
  { slug: 'norvec', name: 'Norveç' },
  { slug: 'orta-afrika-cumhuriyeti', name: 'Orta Afrika Cumhuriyeti' },
  { slug: 'ozbekistan', name: 'Özbekistan' },
  { slug: 'pakistan', name: 'Pakistan' },
  { slug: 'palau', name: 'Palau' },
  { slug: 'panama', name: 'Panama' },
  { slug: 'papua-yeni-gine', name: 'Papua Yeni Gine' },
  { slug: 'paraguay', name: 'Paraguay' },
  { slug: 'peru', name: 'Peru' },
  { slug: 'polonya', name: 'Polonya' },
  { slug: 'portekiz', name: 'Portekiz' },
  { slug: 'romanya', name: 'Romanya' },
  { slug: 'ruanda', name: 'Ruanda' },
  { slug: 'rusya', name: 'Rusya' },
  { slug: 'saint-kitts-ve-nevis', name: 'Saint Kitts ve Nevis' },
  { slug: 'saint-lucia', name: 'Saint Lucia' },
  { slug: 'saint-vincent-ve-grenadinler', name: 'Saint Vincent ve Grenadinler' },
  { slug: 'samoa', name: 'Samoa' },
  { slug: 'san-marino', name: 'San Marino' },
  { slug: 'sao-tome-ve-principe', name: 'São Tomé ve Príncipe' },
  { slug: 'senegal', name: 'Senegal' },
  { slug: 'seyseller', name: 'Seyşeller' },
  { slug: 'sierra-leone', name: 'Sierra Leone' },
  { slug: 'singapur', name: 'Singapur' },
  { slug: 'sirbistan', name: 'Sırbistan' },
  { slug: 'slovakya', name: 'Slovakya' },
  { slug: 'slovenya', name: 'Slovenya' },
  { slug: 'solomon-adalari', name: 'Solomon Adaları' },
  { slug: 'somali', name: 'Somali' },
  { slug: 'sri-lanka', name: 'Sri Lanka' },
  { slug: 'sudan', name: 'Sudan' },
  { slug: 'surinam', name: 'Surinam' },
  { slug: 'suriye', name: 'Suriye' },
  { slug: 'suudi-arabistan', name: 'Suudi Arabistan' },
  { slug: 'sili', name: 'Şili' },
  { slug: 'tacikistan', name: 'Tacikistan' },
  { slug: 'tanzania', name: 'Tanzanya' },
  { slug: 'tayland', name: 'Tayland' },
  { slug: 'tayvan', name: 'Tayvan' },
  { slug: 'timor-leste', name: 'Timor-Leste' },
  { slug: 'togo', name: 'Togo' },
  { slug: 'tonga', name: 'Tonga' },
  { slug: 'trinidad-ve-tobago', name: 'Trinidad ve Tobago' },
  { slug: 'tunus', name: 'Tunus' },
  { slug: 'tuvalu', name: 'Tuvalu' },
  { slug: 'turkiye', name: 'Türkiye' },
  { slug: 'turkmenistan', name: 'Türkmenistan' },
  { slug: 'uganda', name: 'Uganda' },
  { slug: 'ukrayna', name: 'Ukrayna' },
  { slug: 'umman', name: 'Umman' },
  { slug: 'uruguay', name: 'Uruguay' },
  { slug: 'urdun', name: 'Ürdün' },
  { slug: 'vanuatu', name: 'Vanuatu' },
  { slug: 'vatikan', name: 'Vatikan' },
  { slug: 'venezuela', name: 'Venezuela' },
  { slug: 'vietnam', name: 'Vietnam' },
  { slug: 'yemen', name: 'Yemen' },
  { slug: 'yeni-zelanda', name: 'Yeni Zelanda' },
  { slug: 'yesil-burun-adalari', name: 'Yeşil Burun Adaları' },
  { slug: 'yunanistan', name: 'Yunanistan' },
  { slug: 'zambiya', name: 'Zambiya' },
  { slug: 'zimbabve', name: 'Zimbabve' },
]

/** Keep stable aliases for older slugs used in existing articles. */
const SLUG_ALIASES: Record<string, string> = {
  'amerika-birlesik-devletleri': 'abd',
  'demokratik-kongo-cumhuriyeti': 'kongo-demokratik-cumhuriyeti',
  kongo: 'kongo-demokratik-cumhuriyeti',
  'kongo-dr': 'kongo-demokratik-cumhuriyeti',
  drc: 'kongo-demokratik-cumhuriyeti',
  congo: 'kongo-demokratik-cumhuriyeti',
  'congo-brazzaville': 'kongo-cumhuriyeti',
  liechtenstein: 'lihtenstayn',
  'liechtenstayn': 'lihtenstayn',
  'yesil-burun-adalari': 'yesil-burun-adalari',
}

const bySlug = new Map(WORLD_COUNTRIES.map((c) => [c.slug, c]))
const byName = new Map(WORLD_COUNTRIES.map((c) => [c.name.toLocaleLowerCase('tr-TR'), c]))

export function findCountryBySlug(slug: string): WorldCountry | undefined {
  const key = slug.trim().toLowerCase()
  const aliased = SLUG_ALIASES[key] ?? key
  return bySlug.get(aliased)
}

export function findCountryByName(name: string): WorldCountry | undefined {
  const key = name.trim().toLocaleLowerCase('tr-TR')
  if (byName.has(key)) return byName.get(key)

  const aliases: Record<string, string> = {
    abd: 'abd',
    amerika: 'abd',
    usa: 'abd',
    'united states': 'abd',
    'amerika birleşik devletleri': 'abd',
    ingiltere: 'birleşik krallık',
    'united kingdom': 'birleşik krallık',
    uk: 'birleşik krallık',
    kongo: 'kongo demokratik cumhuriyeti',
    'kongo demokratik cumhuriyeti': 'kongo demokratik cumhuriyeti',
    'demokratik kongo cumhuriyeti': 'kongo demokratik cumhuriyeti',
    'demokratik cumhuriyet kongo': 'kongo demokratik cumhuriyeti',
    'dr kongo': 'kongo demokratik cumhuriyeti',
    'd.r. kongo': 'kongo demokratik cumhuriyeti',
    congo: 'kongo demokratik cumhuriyeti',
    'democratic republic of the congo': 'kongo demokratik cumhuriyeti',
    'congo-kinshasa': 'kongo demokratik cumhuriyeti',
    'kongo cumhuriyeti': 'kongo cumhuriyeti',
    'congo-brazzaville': 'kongo cumhuriyeti',
    'republic of the congo': 'kongo cumhuriyeti',
  }

  const mapped = aliases[key]
  if (mapped) return byName.get(mapped)
  return undefined
}

export function resolveCountrySlug(raw?: string | null, countryName?: string | null): string {
  if (raw?.trim()) {
    const fromSlug = findCountryBySlug(raw)
    if (fromSlug) return fromSlug.slug
  }
  if (countryName?.trim()) {
    const fromName = findCountryByName(countryName)
    if (fromName) return fromName.slug
  }
  return ''
}

/** Metinden ülke çıkar — en uzun isim eşleşmesi (Japonya > Jap). */
export function resolveCountryFromText(text: string): WorldCountry | null {
  const raw = text.trim()
  if (!raw) return null

  // Önce açık isim / alias
  const direct = findCountryByName(raw)
  if (direct) return direct

  const lower = raw.toLocaleLowerCase('tr-TR')
  const ascii = lower
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')

  // Alias kelimeleri — ASCII + lookbehind (JS `\b` Türkçe harflerde kırılır:
  // "için" → `\bçin\b` eşleşir ve Çin sanılır). Yalnızca ascii metinde tara.
  const asciiWord = (alts: string) =>
    new RegExp(`(?<![a-z0-9])(?:${alts})(?![a-z0-9])`, 'i')
  const TEXT_ALIASES: Array<[RegExp, string]> = [
    [asciiWord('japonya|japan|japon|nippon|tokyo|osaka|kumamoto|hiroshima'), 'japonya'],
    [asciiWord('abd|amerika|usa|u\\.s\\.a|washington|new york|california'), 'abd'],
    [asciiWord('ingiltere|birlesik krallik|uk|london|britain|england'), 'birleşik krallık'],
    [asciiWord('almanya|germany|berlin|munich|munih'), 'almanya'],
    [asciiWord('fransa|france|paris'), 'fransa'],
    [asciiWord('rusya|russia|moscow|moskova'), 'rusya'],
    // "cin" yalnız başına; "icin" (için) ASLA eşleşmesin
    [asciiWord('cin|china|pekin|beijing'), 'çin'],
    [asciiWord('israil|israel|tel aviv|gazze|gaza'), 'israil'],
    [asciiWord('filistin|palestine|ramallah'), 'filistin'],
    [asciiWord('ukrayna|ukraine|kiev|kyiv'), 'ukrayna'],
    [asciiWord('suriye|syria|damascus|sam'), 'suriye'],
    [asciiWord('irak|iraq|bagdat|baghdad'), 'irak'],
    [asciiWord('iran|iranli|tehran|tahran'), 'iran'],
    [asciiWord('yunanistan|greece|atina|athens'), 'yunanistan'],
    [asciiWord('italya|italy|roma|rome|milan'), 'italya'],
    [asciiWord('ispanya|spain|madrid|barcelona'), 'ispanya'],
    [asciiWord('misir|egypt|kahire|cairo'), 'mısır'],
    [asciiWord('kktc|kuzey kibris|lefkosa'), 'kibris'],
  ]

  for (const [re, nameKey] of TEXT_ALIASES) {
    if (re.test(ascii)) {
      const hit = findCountryByName(nameKey) || findCountryBySlug(nameKey)
      if (hit) return hit
    }
  }

  // Ülke adlarını uzun → kısa tara (false positive azalt)
  const sorted = [...WORLD_COUNTRIES].sort((a, b) => b.name.length - a.name.length)
  for (const c of sorted) {
    if (c.name.length < 4) continue
    const nameNorm = c.name.toLocaleLowerCase('tr-TR')
    const nameAscii = nameNorm
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
    const re = new RegExp(
      `(?<![a-z0-9çğıöşü])${nameAscii.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9çğıöşü])`,
      'i'
    )
    if (re.test(ascii) || lower.includes(nameNorm)) return c
  }

  return null
}
