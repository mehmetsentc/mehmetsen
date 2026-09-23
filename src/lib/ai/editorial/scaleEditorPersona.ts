/**
 * Deterministic journalist-style identities for parametric SCALE desks.
 * Display names are human; slugs stay machine-stable (ulke-*, il-*, ilce-*).
 * Personas are AI editors — bios still disclose that. No fake credentials.
 */

export type NamePool = { first: string[]; last: string[] }

const TR_FIRST = [
  'Aylin', 'Berk', 'Cansu', 'Doruk', 'Elif', 'Fırat', 'Gizem', 'Hakan',
  'İrem', 'Koray', 'Lale', 'Murat', 'Nilay', 'Onur', 'Pelin', 'Rüzgar',
  'Seda', 'Tolga', 'Umut', 'Vildan', 'Yasemin', 'Zafer', 'Barış', 'Cemre',
  'Deniz', 'Ece', 'Ferhat', 'Gül', 'Halil', 'Işıl', 'Kaan', 'Leyla',
  'Mert', 'Naz', 'Okan', 'Pınar', 'Rana', 'Serkan', 'Tuba', 'Utku',
  'Yeliz', 'Zeynep', 'Alper', 'Buse', 'Cihan', 'Derya', 'Emre', 'Funda',
  'Gökhan', 'Hande', 'İlker', 'Kübra', 'Levent', 'Melis', 'Nihan', 'Ozan',
  'Selim', 'Tuğçe', 'Ufuk', 'Yağmur', 'Arda', 'Burcu', 'Canan', 'Ebru',
  'Fatih', 'Gamze', 'Hülya', 'Kemal', 'Nehir', 'Orhan', 'Sevgi', 'Tamer',
  'Banu', 'Cemil', 'Dilan', 'Evren', 'Fulya', 'Güven', 'Hale', 'İpek',
  'Jülide', 'Kerem', 'Melek', 'Nurettin', 'Özge', 'Poyraz', 'Sibel', 'Taner',
]

const TR_LAST = [
  'Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Öztürk', 'Aydın',
  'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Çetin', 'Kara', 'Koç', 'Kurt',
  'Özkan', 'Şimşek', 'Polat', 'Korkmaz', 'Erdem', 'Tekin', 'Avcı', 'Güler',
  'Bulut', 'Ateş', 'Akın', 'Sezer', 'Duman', 'Kaplan', 'Karaca', 'Eren',
  'Işık', 'Tunç', 'Bilgin', 'Özer', 'Dinç', 'Coşkun', 'Ekinci', 'Sönmez',
  'Pehlivan', 'Akkaya', 'Eroğlu', 'Fidan', 'Gökçe', 'İnce', 'Kartal', 'Oruç',
  'Pamuk', 'Seyhan', 'Korhan', 'Aladağ', 'Kepez', 'Soysal', 'Yurtseven',
  'Akkılıç', 'Manavgat', 'Kumral', 'Serik', 'Anafarta', 'Truva', 'Belek',
  'Akbay', 'Tuna', 'Albayrak', 'Sarıgül', 'Bozer', 'Tanrıverdi', 'Özçelik',
  'Karataş', 'Uluç', 'Demirtaş', 'Aksu', 'Perge', 'Kaleiçi', 'Side',
]

const US_FIRST = [
  'James', 'Emma', 'Noah', 'Olivia', 'Liam', 'Ava', 'Ethan', 'Sophia',
  'Mason', 'Isabella', 'Lucas', 'Mia', 'Henry', 'Amelia', 'Alexander', 'Harper',
  'Benjamin', 'Evelyn', 'Michael', 'Abigail', 'Daniel', 'Emily', 'Matthew', 'Ella',
  'Samuel', 'Scarlett', 'Jack', 'Grace', 'Owen', 'Chloe', 'Caleb', 'Lily',
  'Nathan', 'Hannah', 'Ryan', 'Natalie', 'Adrian', 'Zoe', 'Julian', 'Audrey',
]
const US_LAST = [
  'Brooks', 'Bennett', 'Sullivan', 'Hayes', 'Parker', 'Morgan', 'Reid', 'Walsh',
  'Quinn', 'Foster', 'Ellis', 'Grant', 'Callahan', 'Whitman', 'Porter', 'Adler',
  'Brennan', 'Carson', 'Dalton', 'Everett', 'Fletcher', 'Griffin', 'Harlan', 'Ives',
  'Keller', 'Lawson', 'McKenna', 'Nolan', 'Prescott', 'Rowe', 'Sawyer', 'Trent',
]

const DE_FIRST = ['Lukas', 'Anna', 'Jonas', 'Lena', 'Felix', 'Marie', 'Paul', 'Emma', 'Maximilian', 'Sophie', 'Noah', 'Mia', 'Leon', 'Hannah', 'Finn', 'Emilia']
const DE_LAST = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Wagner', 'Becker', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann']

const FR_FIRST = ['Louis', 'Emma', 'Hugo', 'Léa', 'Gabriel', 'Chloé', 'Raphaël', 'Manon', 'Arthur', 'Camille', 'Jules', 'Inès', 'Adam', 'Jade', 'Lucas', 'Louise']
const FR_LAST = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David']

const ES_FIRST = ['Hugo', 'Lucía', 'Martín', 'Sofía', 'Daniel', 'María', 'Pablo', 'Martina', 'Alejandro', 'Paula', 'Álvaro', 'Daniela', 'Adrián', 'Carla', 'Diego', 'Alba']
const ES_LAST = ['García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Martín', 'Gómez', 'Ruiz', 'Díaz', 'Hernández', 'Moreno', 'Muñoz', 'Álvarez']

const IT_FIRST = ['Leonardo', 'Sofia', 'Francesco', 'Giulia', 'Alessandro', 'Aurora', 'Lorenzo', 'Ginevra', 'Mattia', 'Beatrice', 'Andrea', 'Alice', 'Gabriele', 'Greta', 'Riccardo', 'Emma']
const IT_LAST = ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Costa', 'Fontana']

const GB_FIRST = ['Oliver', 'Olivia', 'George', 'Amelia', 'Harry', 'Isla', 'Jack', 'Ava', 'Charlie', 'Mia', 'Leo', 'Grace', 'Oscar', 'Willow', 'Arthur', 'Emily']
const GB_LAST = ['Hart', 'Clarke', 'Stewart', 'Murray', 'Hughes', 'Watson', 'Bennett', 'Palmer', 'Pearson', 'Henderson', 'Chapman', 'Holmes', 'Russell', 'Harrison', 'Graham', 'Patel']

const JP_FIRST = ['Haruto', 'Yui', 'Sota', 'Aoi', 'Yuto', 'Hana', 'Ren', 'Sakura', 'Kaito', 'Mei', 'Hinata', 'Yuna', 'Riku', 'Mio', 'Sora', 'Akari']
const JP_LAST = ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi', 'Matsumoto', 'Inoue']

const RU_FIRST = ['Ivan', 'Anna', 'Dmitri', 'Maria', 'Alexei', 'Olga', 'Sergei', 'Elena', 'Nikolai', 'Tatiana', 'Pavel', 'Irina', 'Andrei', 'Natalia', 'Mikhail', 'Svetlana']
const RU_LAST = ['Ivanov', 'Petrov', 'Sidorov', 'Smirnov', 'Kuznetsov', 'Popov', 'Vasiliev', 'Sokolov', 'Mikhailov', 'Novikov', 'Fedorov', 'Morozov', 'Volkov', 'Alekseev', 'Lebedev', 'Semenov']

const IL_FIRST = ['Noa', 'David', 'Maya', 'Yonatan', 'Tamar', 'Daniel', 'Shira', 'Eitan', 'Yael', 'Amit', 'Lior', 'Michal', 'Ido', 'Roni', 'Omer', 'Noga']
const IL_LAST = ['Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Biton', 'Azoulay', 'Dahan', 'Friedman', 'Katz', 'Shapiro', 'Ben-David', 'Malka', 'Ohana', 'Hadad', 'Ashkenazi', 'Bar']

const AR_FIRST = ['Omar', 'Layla', 'Yusuf', 'Amina', 'Karim', 'Hana', 'Tariq', 'Nour', 'Samir', 'Dina', 'Ziad', 'Rania', 'Adel', 'Salma', 'Fadi', 'Maya']
const AR_LAST = ['Hassan', 'Nasser', 'Khalil', 'Mansour', 'Farouk', 'Saleh', 'Qasim', 'Darwish', 'Haddad', 'Karim', 'Nabulsi', 'Husseini', 'Salem', 'Abbas', 'Rahman', 'Younes']

const IR_FIRST = ['Reza', 'Sara', 'Amir', 'Leila', 'Navid', 'Maryam', 'Pouya', 'Azadeh', 'Kian', 'Nasrin', 'Omid', 'Shirin', 'Arman', 'Parisa', 'Sina', 'Elham']
const IR_LAST = ['Hosseini', 'Mohammadi', 'Karimi', 'Ahmadi', 'Rahimi', 'Jafari', 'Moradi', 'Nouri', 'Kazemi', 'Sadeghi', 'Farhadi', 'Azizi', 'Sharifi', 'Ebrahimi', 'Ghasemi', 'Najafi']

const IN_FIRST = ['Arjun', 'Ananya', 'Rohan', 'Isha', 'Vikram', 'Priya', 'Aditya', 'Meera', 'Karan', 'Neha', 'Rahul', 'Kavya', 'Siddharth', 'Diya', 'Aman', 'Sana']
const IN_LAST = ['Sharma', 'Patel', 'Singh', 'Gupta', 'Mehta', 'Nair', 'Reddy', 'Iyer', 'Khan', 'Das', 'Joshi', 'Kapoor', 'Malhotra', 'Chopra', 'Bose', 'Menon']

const GR_FIRST = ['Nikos', 'Eleni', 'Dimitris', 'Maria', 'Yiannis', 'Sofia', 'Kostas', 'Katerina', 'Alexandros', 'Anna', 'Panagiotis', 'Georgia', 'Andreas', 'Christina', 'Giorgos', 'Ioanna']
const GR_LAST = ['Papadopoulos', 'Papadakis', 'Nikolaou', 'Georgiou', 'Dimitriou', 'Ioannou', 'Vasileiou', 'Konstantinou', 'Alexiou', 'Christou', 'Makris', 'Papanikolaou', 'Antoniou', 'Economou', 'Lambrou', 'Stavrou']

const UA_FIRST = ['Oleksandr', 'Olena', 'Dmytro', 'Anastasiia', 'Andriy', 'Kateryna', 'Ivan', 'Sofiia', 'Maksym', 'Yulia', 'Taras', 'Iryna', 'Bohdan', 'Maria', 'Viktor', 'Natalia']
const UA_LAST = ['Shevchenko', 'Kovalenko', 'Bondarenko', 'Tkachenko', 'Kravchenko', 'Melnyk', 'Shevchuk', 'Polishchuk', 'Boyko', 'Kovalchuk', 'Oliynyk', 'Savchenko', 'Rudenko', 'Moroz', 'Lysenko', 'Petrenko']

const NP_FIRST = ['Aarav', 'Anisha', 'Bikash', 'Sita', 'Prakash', 'Maya', 'Nabin', 'Sunita', 'Kiran', 'Sabina', 'Ramesh', 'Puja', 'Sanjay', 'Laxmi', 'Dipesh', 'Manisha']
const NP_LAST = ['Shrestha', 'Gurung', 'Tamang', 'Rai', 'Magar', 'Adhikari', 'Karki', 'Thapa', 'Basnet', 'Poudel', 'Khadka', 'Bhandari', 'Sharma', 'Maharjan', 'Lama', 'Dahal']

const INTL_FIRST = ['Alex', 'Maya', 'Leo', 'Nina', 'Omar', 'Clara', 'Theo', 'Iris', 'Sam', 'Noor', 'Eli', 'Vera', 'Jonas', 'Hana', 'Marc', 'Lina']
const INTL_LAST = ['Hart', 'Vogel', 'Marin', 'Costa', 'Berg', 'Silva', 'Khan', 'Novak', 'Dupont', 'Morel', 'Lang', 'Weiss', 'Ortega', 'Nielsen', 'Kovacs', 'Anders']

const POOLS: Record<string, NamePool> = {
  abd: { first: US_FIRST, last: US_LAST },
  us: { first: US_FIRST, last: US_LAST },
  almanya: { first: DE_FIRST, last: DE_LAST },
  de: { first: DE_FIRST, last: DE_LAST },
  fransa: { first: FR_FIRST, last: FR_LAST },
  fr: { first: FR_FIRST, last: FR_LAST },
  ispanya: { first: ES_FIRST, last: ES_LAST },
  es: { first: ES_FIRST, last: ES_LAST },
  italya: { first: IT_FIRST, last: IT_LAST },
  it: { first: IT_FIRST, last: IT_LAST },
  'birlesik-krallik': { first: GB_FIRST, last: GB_LAST },
  gb: { first: GB_FIRST, last: GB_LAST },
  uk: { first: GB_FIRST, last: GB_LAST },
  japonya: { first: JP_FIRST, last: JP_LAST },
  jp: { first: JP_FIRST, last: JP_LAST },
  rusya: { first: RU_FIRST, last: RU_LAST },
  ru: { first: RU_FIRST, last: RU_LAST },
  israil: { first: IL_FIRST, last: IL_LAST },
  il: { first: IL_FIRST, last: IL_LAST },
  filistin: { first: AR_FIRST, last: AR_LAST },
  iran: { first: IR_FIRST, last: IR_LAST },
  hindistan: { first: IN_FIRST, last: IN_LAST },
  in: { first: IN_FIRST, last: IN_LAST },
  yunanistan: { first: GR_FIRST, last: GR_LAST },
  gr: { first: GR_FIRST, last: GR_LAST },
  ukrayna: { first: UA_FIRST, last: UA_LAST },
  ua: { first: UA_FIRST, last: UA_LAST },
  nepal: { first: NP_FIRST, last: NP_LAST },
  np: { first: NP_FIRST, last: NP_LAST },
}

export function editorPortraitUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/lorelei/png?seed=${encodeURIComponent(seed)}&size=256`
}

export function editorCoverUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/glass/png?seed=${encodeURIComponent(`${seed}-cover`)}&size=1280`
}

export function hashSlug(slug: string): number {
  let h = 2166136261
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickName(slug: string, pool: NamePool): string {
  const h = hashSlug(slug)
  const first = pool.first[h % pool.first.length]!
  const last = pool.last[Math.floor(h / pool.first.length) % pool.last.length]!
  return `${first} ${last}`
}

export function poolForCountry(countryKey?: string | null): NamePool {
  const key = countryKey?.trim().toLowerCase() ?? ''
  return POOLS[key] ?? { first: INTL_FIRST, last: INTL_LAST }
}

export type ScaleJournalistPersona = {
  name: string
  title: string
  shortBio: string
  bio: string
  avatarUrl: string
  coverUrl: string
}

export function scaleJournalistPersona(input: {
  slug: string
  deskLabel: string
  placeName: string
  layer: 'country' | 'province' | 'district'
  countryKey?: string | null
}): ScaleJournalistPersona {
  const pool =
    input.layer === 'country' ? poolForCountry(input.countryKey) : { first: TR_FIRST, last: TR_LAST }
  const name = pickName(input.slug, pool)
  const desk = input.deskLabel.trim()
  const place = input.placeName.trim()
  return {
    name,
    title: `${desk} editörü`,
    shortBio: `${name} — NaHaber ${desk} masası.`,
    bio: `${name}, NaHaber ${place} ${desk} masasında yazar. Masa kimliği byline’da görünür; kaynak adı değildir. AI editör personası — sahte diploma veya insan kimliği yok.`,
    avatarUrl: editorPortraitUrl(input.slug),
    coverUrl: editorCoverUrl(input.slug),
  }
}

export function withEditorMedia<T extends { slug: string; avatarUrl?: string | null; coverUrl?: string | null }>(
  spec: T
): T {
  return {
    ...spec,
    avatarUrl: spec.avatarUrl?.trim() || editorPortraitUrl(spec.slug),
    coverUrl: spec.coverUrl?.trim() || editorCoverUrl(spec.slug),
  }
}

/** P5/P6 customized nationals — never rename; only fill missing media. */
export const IDENTITY_NAME_LOCK_SLUGS = [
  'selin-aras',
  'arda-sahin',
  'ece-yalin',
  'mert-karaca',
  'defne-aksoy',
  'kerem-aydin',
  'deniz-erdem',
  'ipek-demir',
] as const

export function isParametricDeskSlug(slug: string): boolean {
  const key = slug.trim().toLowerCase()
  return key.startsWith('ulke-') || key.startsWith('ilce-') || /^il-/.test(key)
}

export function looksLikeFactoryDeskName(name: string): boolean {
  const n = name.trim()
  return / AI$/i.test(n) || / AI Editörü$/i.test(n)
}

export type EditorIdentityPatch = {
  name?: string
  title?: string
  shortBio?: string
  bio?: string
  avatarUrl?: string
  coverUrl?: string
}

type IdentitySource = {
  name: string
  title: string
  shortBio: string
  bio: string
  avatarUrl?: string | null
  coverUrl?: string | null
}

export function identityPatchForEditor(
  editor: {
    slug: string
    name: string
    title: string
    shortBio?: string
    bio?: string
    avatarUrl?: string | null
    coverUrl?: string | null
  },
  spec: IdentitySource | null
): EditorIdentityPatch | null {
  const slug = editor.slug.trim().toLowerCase()
  const media = {
    avatarUrl: spec?.avatarUrl?.trim() || editorPortraitUrl(slug),
    coverUrl: spec?.coverUrl?.trim() || editorCoverUrl(slug),
  }
  const locked = (IDENTITY_NAME_LOCK_SLUGS as readonly string[]).includes(slug)
  if (locked) {
    const patch: EditorIdentityPatch = {}
    if (!editor.avatarUrl?.trim()) patch.avatarUrl = media.avatarUrl
    if (!editor.coverUrl?.trim()) patch.coverUrl = media.coverUrl
    return Object.keys(patch).length ? patch : null
  }

  const rename = isParametricDeskSlug(slug) || looksLikeFactoryDeskName(editor.name)
  if (rename && spec) {
    return {
      name: spec.name,
      title: spec.title,
      shortBio: spec.shortBio,
      bio: spec.bio,
      avatarUrl: media.avatarUrl,
      coverUrl: media.coverUrl,
    }
  }

  const patch: EditorIdentityPatch = {}
  if (!editor.avatarUrl?.trim()) patch.avatarUrl = media.avatarUrl
  if (!editor.coverUrl?.trim()) patch.coverUrl = media.coverUrl
  if (spec && /AI/.test(editor.title) && spec.title && spec.title !== editor.title) {
    patch.title = spec.title
  }
  return Object.keys(patch).length ? patch : null
}
