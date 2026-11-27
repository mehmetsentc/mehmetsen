/**
 * LİSTE STÜDYOSU — Top N müzik / film / dizi / DJ tanıtım videoları (saf model; sunucu + tarayıcı ortak).
 *
 * Bir liste projesi PARÇALARA derlenir: giriş · her sıra · kapanış. Her parça KURGU motoruyla
 * (EditProject, closing: false) ayrı üretilir; sonra parçalar yeniden kodlanmadan tek MP4'te
 * birleşir (tek parça video). Bir sıra değişirse yalnız o parça yeniden üretilir.
 *
 * Çıktıda NaHaber logosu / yazısı / kapanışı YOKTUR; kapanışta yayıncının (sayfanın) kartı vardır.
 * Seslendirme: Gemini TTS (ücretli, ortak aylık ses bütçesi). Anons metinleri ücretsiz şablonla yazılır.
 */
import { EMPTY_RENDER, FILTERS, TRANSITIONS, newItemId, timeline, type Aspect, type EditAsset, type EditProject, type FilterPreset, type RenderState, type TextItem, type Transition, type VideoClip, type AudioItem } from '@/lib/edit/editProject'
import { AD_TEXT_STYLES, AD_VOICES, AD_VOICE_IDS, type AdOverlay, type AdTextStyle, type AdVoiceId } from '@/lib/adStudio/adModel'
import { MUSIC_PRESETS, TRANSITION_MS, type MusicPreset } from '@/lib/edit/editProject'
import { EVENT_TEMPLATES, TEMPLATE_INFO, dayLong, dayShort, isCardTemplate, subtitleChunks, type EventTemplate, type IntroLayout } from './eventTemplates'

export const LIST_PROJECTS = 'listProjects'
export const LIST_ID_RE = /^ls[A-Za-z0-9]{10,30}$/

// ── liste türleri ────────────────────────────────────────────────────────────
export const LIST_TYPES = ['tr-genel', 'pop', 'yabanci', 'dans', 'rap', 'dj', 'shazam', 'spotify', 'radyo', 'netflix-film', 'netflix-dizi', 'dizi', 'sinema', 'ozel', 'tek-telefon', 'tek-bilgisayar', 'tek-tv', 'tek-urun', 'tek-ai', 'urun-tanitim', 'ai-tanitim', 'tek-haber', 'etkinlik'] as const
export type ListType = (typeof LIST_TYPES)[number]
export type ListCategory = 'muzik' | 'sinema' | 'kisi' | 'teknoloji' | 'etkinlik'
/** Stüdyo: Liste Stüdyosu (müzik / sinema) ve Teknoloji Stüdyosu ayrı bölümlerdir; motor ortaktır. */
export const STUDIOS = ['muzik', 'teknoloji', 'etkinlik'] as const
export type Studio = (typeof STUDIOS)[number]
/** liste: Top N (sıra kartları) · urun: tek ürün / teknoloji / haber tanıtımı (özellik kartları) */
export type ListMode = 'liste' | 'urun' | 'etkinlik'

export const LIST_PACKS = ['dj', 'fragman', 'genc', 'lounge', 'tech', 'minimal', 'sehir', 'gece', 'kultur'] as const
export type ListPack = (typeof LIST_PACKS)[number]

export type ListTypeInfo = { label: string; category: ListCategory; pack: ListPack; title: string; noun: string; subtitleLabel: string; source: string; count: number; studio?: Studio; mode?: ListMode; titleLabel?: string }
export const LIST_TYPE_INFO: Record<ListType, ListTypeInfo> = {
  'tr-genel': { label: 'Top Türkiye', category: 'muzik', pack: 'dj', title: 'Türkiye’de Bu Hafta En Çok Dinlenenler', noun: 'şarkı', subtitleLabel: 'Sanatçı', source: 'Apple Music Türkiye listesi (2. aşamada otomatik) · şimdilik yapıştır / elle', count: 10 },
  pop: { label: 'Top Pop', category: 'muzik', pack: 'dj', title: 'Haftanın En İyi Pop Şarkıları', noun: 'pop şarkısı', subtitleLabel: 'Sanatçı', source: 'Yapıştır / elle', count: 10 },
  yabanci: { label: 'Top Yabancı', category: 'muzik', pack: 'dj', title: 'Dünyada Bu Hafta En Çok Dinlenenler', noun: 'yabancı şarkı', subtitleLabel: 'Sanatçı', source: 'Apple Music küresel listesi (2. aşamada otomatik) · şimdilik yapıştır / elle', count: 10 },
  dans: { label: 'Top Dans', category: 'muzik', pack: 'genc', title: 'Haftanın En İyi Dans Şarkıları', noun: 'dans şarkısı', subtitleLabel: 'Sanatçı', source: 'Yapıştır / elle', count: 10 },
  rap: { label: 'Top Rap', category: 'muzik', pack: 'genc', title: 'Haftanın En İyi Rap Şarkıları', noun: 'rap şarkısı', subtitleLabel: 'Sanatçı', source: 'Yapıştır / elle', count: 10 },
  dj: { label: 'Top DJ', category: 'kisi', pack: 'genc', title: 'Dünyanın En İyi DJ’leri', noun: 'DJ', subtitleLabel: 'Ülke / öne çıkan işi', source: 'Elle (sıra = DJ, klip = set / performans)', count: 10 },
  shazam: { label: 'Top Shazam', category: 'muzik', pack: 'dj', title: 'Shazam’da Bu Hafta En Çok Arananlar', noun: 'şarkı', subtitleLabel: 'Sanatçı', source: 'Shazam listesini yapıştırın', count: 10 },
  spotify: { label: 'Top Spotify', category: 'muzik', pack: 'dj', title: 'Spotify’da Bu Hafta Zirvedekiler', noun: 'şarkı', subtitleLabel: 'Sanatçı', source: 'Spotify listesini yapıştırın', count: 10 },
  radyo: { label: 'Top Radyo', category: 'muzik', pack: 'lounge', title: 'Radyolarda Bu Hafta En Çok Çalanlar', noun: 'şarkı', subtitleLabel: 'Sanatçı', source: 'Elle', count: 10 },
  'netflix-film': { label: 'Top Netflix Film', category: 'sinema', pack: 'fragman', title: 'Netflix’te Bu Hafta En Çok İzlenen Filmler', noun: 'film', subtitleLabel: 'Tür / yıl', source: 'Netflix resmî haftalık listesi (2. aşamada otomatik, salı) · şimdilik elle', count: 10 },
  'netflix-dizi': { label: 'Top Netflix Dizi', category: 'sinema', pack: 'fragman', title: 'Netflix’te Bu Hafta En Çok İzlenen Diziler', noun: 'dizi', subtitleLabel: 'Sezon / tür', source: 'Netflix resmî haftalık listesi (2. aşamada otomatik, salı) · şimdilik elle', count: 10 },
  dizi: { label: 'Top Dizi', category: 'sinema', pack: 'fragman', title: 'Haftanın En Çok İzlenen Dizileri', noun: 'dizi', subtitleLabel: 'Kanal / platform', source: 'Elle', count: 10 },
  sinema: { label: 'Top Sinema', category: 'sinema', pack: 'fragman', title: 'Gişede Bu Hafta Zirvedekiler', noun: 'film', subtitleLabel: 'Tür / yönetmen', source: 'Elle', count: 10 },
  ozel: { label: 'Özel liste', category: 'muzik', pack: 'dj', title: 'Haftanın En İyileri', noun: 'parça', subtitleLabel: 'Alt bilgi', source: 'Elle', count: 10 },
  // ── TEKNOLOJİ STÜDYOSU ──
  'tek-telefon': { label: 'Top Telefonlar', category: 'teknoloji', pack: 'tech', title: 'Bu Ayın En İyi Telefonları', noun: 'telefon', subtitleLabel: 'Marka', titleLabel: 'Model', source: 'Elle / yapıştır', count: 10, studio: 'teknoloji', mode: 'liste' },
  'tek-bilgisayar': { label: 'Top Bilgisayarlar', category: 'teknoloji', pack: 'tech', title: 'En İyi Dizüstü Bilgisayarlar', noun: 'bilgisayar', subtitleLabel: 'Marka', titleLabel: 'Model', source: 'Elle / yapıştır', count: 10, studio: 'teknoloji', mode: 'liste' },
  'tek-tv': { label: 'Top Televizyonlar', category: 'teknoloji', pack: 'minimal', title: 'En İyi Televizyonlar', noun: 'televizyon', subtitleLabel: 'Marka', titleLabel: 'Model', source: 'Elle / yapıştır', count: 10, studio: 'teknoloji', mode: 'liste' },
  'tek-urun': { label: 'En İyi Teknolojik Ürünler', category: 'teknoloji', pack: 'tech', title: 'Ayın En İyi 5 Teknolojik Ürünü', noun: 'ürün', subtitleLabel: 'Marka / kategori', titleLabel: 'Ürün', source: 'Elle', count: 5, studio: 'teknoloji', mode: 'liste' },
  'tek-ai': { label: 'Top Yapay Zekâ Araçları', category: 'teknoloji', pack: 'tech', title: 'En İyi Yapay Zekâ Araçları', noun: 'yapay zekâ aracı', subtitleLabel: 'Şirket / ne işe yarar', titleLabel: 'Araç', source: 'Elle', count: 10, studio: 'teknoloji', mode: 'liste' },
  'urun-tanitim': { label: 'Ürün tanıtımı', category: 'teknoloji', pack: 'minimal', title: 'Yeni ürün', noun: 'özellik', subtitleLabel: 'Açıklama', titleLabel: 'Özellik (ör. Kamera)', source: 'Elle (telefon, bilgisayar, TV ya da başka bir ürün)', count: 5, studio: 'teknoloji', mode: 'urun' },
  'ai-tanitim': { label: 'Yapay zekâ tanıtımı', category: 'teknoloji', pack: 'tech', title: 'Yeni yapay zekâ', noun: 'özellik', subtitleLabel: 'Açıklama', titleLabel: 'Yetenek', source: 'Elle', count: 5, studio: 'teknoloji', mode: 'urun' },
  // ── ETKİNLİK VİDEO STÜDYOSU (Etkinlik Masası'ndan) ──
  etkinlik: { label: 'Etkinlik videosu', category: 'etkinlik', pack: 'sehir', title: 'Bu Hafta Neler Var?', noun: 'etkinlik', subtitleLabel: 'Mekân', titleLabel: 'Etkinlik', source: 'Etkinlik Masası (seçilen etkinlikler)', count: 5, studio: 'etkinlik', mode: 'etkinlik' },
  'tek-haber': { label: 'Teknoloji haberi', category: 'teknoloji', pack: 'tech', title: 'Teknoloji', noun: 'başlık', subtitleLabel: 'Ayrıntı', titleLabel: 'Başlık', source: 'NaHaber teknoloji haberinden (haber seçin) ya da elle', count: 5, studio: 'teknoloji', mode: 'urun' },
}
export const studioOf = (t: ListType): Studio => LIST_TYPE_INFO[t].studio ?? 'muzik'
export const modeOf = (t: ListType): ListMode => LIST_TYPE_INFO[t].mode ?? 'liste'
export const typesOf = (studio: Studio): ListType[] => LIST_TYPES.filter((t) => studioOf(t) === studio)
export const packsOf = (studio: Studio): ListPack[] => (studio === 'etkinlik' ? ['sehir', 'gece', 'kultur'] : studio === 'teknoloji' ? ['tech', 'minimal', 'genc', 'fragman'] : ['dj', 'fragman', 'genc', 'lounge'])

// ── sunum paketleri ──────────────────────────────────────────────────────────
export type RankLook = 'neon' | 'cinema' | 'bold' | 'soft' | 'tech' | 'minimal'
export type PackInfo = {
  label: string
  desc: string
  voice: AdVoiceId
  /** Gemini TTS sunum yönergesi */
  persona: string
  delivery: string
  transition: Transition
  /** «Karışık» geçişte sırayla dönecek geçişler */
  mix: Transition[]
  filter: FilterPreset
  bars: boolean
  textStyle: AdTextStyle
  accent: string
  rankLook: RankLook
  sfx: SfxName | null
}
export const LIST_PACK_INFO: Record<ListPack, PackInfo> = {
  dj: { label: 'Radyo DJ', desc: 'Enerjik, samimi sunucu; neon sıra kartı, kayan ve yakınlaşan geçişler', voice: 'mert', persona: 'an energetic, charismatic Turkish radio DJ hosting the weekly chart countdown', delivery: 'upbeat, smiling, punchy; build excitement on the rank number and the song title; lively rhythm', transition: 'slideleft', mix: ['slideleft', 'zoomin', 'slideup', 'circleopen', 'slideright'], filter: 'canli', bars: false, textStyle: 'vurgu', accent: '#ff2d95', rankLook: 'neon', sfx: 'whoosh-up' },
  fragman: { label: 'Fragman', desc: 'Derin, dramatik ses; sinema bantları, kararan geçişler, sinema tonu', voice: 'kaan', persona: 'a deep, dramatic Turkish movie-trailer narrator', delivery: 'slow, epic and suspenseful; dramatic pauses at ellipses; weight on the title', transition: 'fade', mix: ['fade', 'dissolve', 'circleopen', 'wipeleft'], filter: 'sinema', bars: true, textStyle: 'sinema', accent: '#f5c518', rankLook: 'cinema', sfx: 'whoosh-down' },
  genc: { label: 'Gençlik / TikTok', desc: 'Hızlı, esprili anlatım; büyük kalın yazılar, hızlı kayan geçişler', voice: 'mert', persona: 'a fast, witty young Turkish social-media host', delivery: 'fast, playful and confident; quick rhythm; short punchy emphasis (no slang)', transition: 'slideup', mix: ['slideup', 'zoomin', 'slideleft', 'wipeleft'], filter: 'canli', bars: false, textStyle: 'guclu', accent: '#a3e635', rankLook: 'bold', sfx: 'whoosh-up' },
  tech: { label: 'Teknoloji', desc: 'Fütüristik: camgöbeği vurgular, ızgara ve kod çizgileri, hızlı kayan / yakınlaşan geçişler, net anlatım', voice: 'kaan', persona: 'a confident, modern Turkish tech reviewer presenting the latest gadgets', delivery: 'clear, crisp and energetic; precise on numbers and model names; confident pace', transition: 'slideleft', mix: ['slideleft', 'zoomin', 'wipeleft', 'circleopen', 'slideup'], filter: 'soguk', bars: false, textStyle: 'kurumsal', accent: '#22d3ee', rankLook: 'tech', sfx: 'whoosh-up' },
  minimal: { label: 'Premium / Sade', desc: 'Sade ve şık (lansman tarzı): beyaz ince yazılar, yumuşak geçişler, zarif ses', voice: 'selin', persona: 'an elegant, calm Turkish product-launch presenter', delivery: 'smooth, premium and unhurried; gentle emphasis on key features', transition: 'dissolve', mix: ['dissolve', 'fade', 'slideup'], filter: 'none', bars: false, textStyle: 'zarif', accent: '#e5e7eb', rankLook: 'minimal', sfx: 'click' },
  sehir: { label: 'Şehir rehberi', desc: 'Canlı ve net: kırmızı tarih rozeti, kalın yazılar, kayan geçişler', voice: 'mert', persona: 'a friendly, upbeat Turkish city-events guide', delivery: 'warm, lively and clear; precise on dates, times and venues; inviting tone', transition: 'slideleft', mix: ['slideleft', 'slideup', 'zoomin'], filter: 'canli', bars: false, textStyle: 'bant', accent: '#dc2626', rankLook: 'bold', sfx: 'whoosh-up' },
  gece: { label: 'Gece hayatı', desc: 'Konser ve parti için neon: parlayan yazılar, enerjik anlatım', voice: 'mert', persona: 'an energetic Turkish nightlife and concert host', delivery: 'energetic, exciting, punchy; build hype on the artist name; clear date and venue', transition: 'zoomin', mix: ['zoomin', 'slideleft', 'circleopen'], filter: 'canli', bars: false, textStyle: 'vurgu', accent: '#ff2d95', rankLook: 'neon', sfx: 'whoosh-up' },
  kultur: { label: 'Kültür-sanat', desc: 'Tiyatro, sergi, klasik müzik: zarif yazılar, sakin anlatım', voice: 'selin', persona: 'an elegant, calm Turkish arts and culture presenter', delivery: 'graceful, warm and unhurried; clear on dates and venues', transition: 'dissolve', mix: ['dissolve', 'fade'], filter: 'sicak', bars: false, textStyle: 'zarif', accent: '#d4af37', rankLook: 'soft', sfx: null },
  lounge: { label: 'Gece / Lounge', desc: 'Sakin, sıcak ses; yumuşak çözülme geçişleri, sıcak ton', voice: 'selin', persona: 'a calm, warm, intimate Turkish late-night radio host', delivery: 'soft, warm and relaxed; unhurried; gentle smile in the voice', transition: 'dissolve', mix: ['dissolve', 'fade', 'circleopen'], filter: 'sicak', bars: false, textStyle: 'zarif', accent: '#d4af37', rankLook: 'soft', sfx: null },
}

export const LIST_TRANSITIONS = [...TRANSITIONS, 'karisik'] as const
export type ListTransition = (typeof LIST_TRANSITIONS)[number]
export const LIST_TRANSITION_LABEL: Record<ListTransition, string> = { none: 'Kesme', fade: 'Kararma', dissolve: 'Çözülme', slideleft: 'Sola kay', slideright: 'Sağa kay', slideup: 'Yukarı kay', wipeleft: 'Silme', circleopen: 'Daire açılış', zoomin: 'Yakınlaşarak', karisik: 'Karışık (pakete göre dönüşümlü)' }

export const SFX_NAMES = ['whoosh-up', 'whoosh-down', 'click', 'intro-zoom', 'intro-slide', 'outro-follow'] as const
export type SfxName = (typeof SFX_NAMES)[number]
/** sunucudaki yerel dosya (Storage'a bir kez yüklenir) */
export const SFX_FILE: Record<SfxName, string> = {
  'whoosh-up': 'src/lib/reels/assets/audio/broadcast/whoosh-up.wav',
  'whoosh-down': 'src/lib/reels/assets/audio/broadcast/whoosh-down.wav',
  click: 'src/lib/reels/assets/audio/broadcast/click.wav',
  'intro-zoom': 'src/lib/reels/assets/audio/broadcast/intro-zoom.wav',
  'intro-slide': 'src/lib/reels/assets/audio/broadcast/intro-slide.wav',
  'outro-follow': 'src/lib/reels/assets/audio/broadcast/outro-follow.wav',
}

export const LIST_ASPECTS = ['9:16', '4:5', '1:1', '16:9'] as const satisfies readonly Aspect[]
export type ListAspect = (typeof LIST_ASPECTS)[number]
export const CLIP_SOUNDS = ['kisik', 'acik', 'kapali'] as const
export type ClipSound = (typeof CLIP_SOUNDS)[number]
export const CLIP_SOUND_LABEL: Record<ClipSound, string> = { kisik: 'Anons sırasında kısılır', acik: 'Hep açık', kapali: 'Kapalı' }
export const LOGO_PLACEMENTS = ['yok', 'giris', 'kose', 'rozet'] as const
export type LogoPlacement = (typeof LOGO_PLACEMENTS)[number]
export const LOGO_PLACEMENT_LABEL: Record<LogoPlacement, string> = { yok: 'Logo yok', giris: 'Yalnız girişte', kose: 'Köşede sürekli', rozet: 'Her sırada rozet' }
export const TEXT_POSITIONS = ['alt', 'orta', 'ust'] as const
export type ListTextPos = (typeof TEXT_POSITIONS)[number]
export const CHANGES = ['none', 'new', 'up', 'down', 'same'] as const
export type RankChange = (typeof CHANGES)[number]
export const CHANGE_LABEL: Record<RankChange, string> = { none: '—', new: 'Yeni', up: 'Yükseldi', down: 'Düştü', same: 'Aynı' }

export const LIST_LIMITS = { items: 30, title: 100, itemTitle: 90, itemSub: 80, announce: 240, clipMinMs: 5_000, clipMaxMs: 60_000, softMinMs: 15_000, softMaxMs: 30_000, imageMs: 5_000, totalMs: 15 * 60_000 }
export const RANK_CARD_MS = 2_000
export const INTRO_MS = 3_400
export const OUTRO_MS = 3_200

// ── tipler ───────────────────────────────────────────────────────────────────
export interface ListMedia {
  kind: 'video' | 'image'
  url: string
  name: string
  durationMs: number | null
  inMs: number
  outMs: number
  hasAudio?: boolean
  width?: number
  height?: number
}
export interface ListVoice {
  url: string
  durationMs: number
  hash: string
  createdAt: number
}
export interface ListItem {
  id: string
  title: string
  subtitle: string
  change: RankChange
  prevRank: number | null
  weeks: number | null
  media: ListMedia | null
  coverUrl: string | null
  /** -1..1 kadraj kaydırma; 1..2 yakınlaştırma */
  posX: number
  posY: number
  scale: number
  /** klibin kendi ses seviyesi 0..1 */
  volume: number
  announce: string
  voice: ListVoice | null
  /** bu sıraya özel yazı rengi (boş = liste rengi) */
  accent: string | null
  /** TEKNOLOJİ: özellik kartı (en fazla 6 satır) ve fiyat */
  specs: Array<{ label: string; value: string }>
  price: string
  /** ETKİNLİK: masadaki etkinliğin bilgileri (kart için) */
  event: EventInfo | null
  /** ETKİNLİK: önce klibin kendi sesi (ör. konser), sonra anlatım */
  ownFirst: boolean
  /** ETKİNLİK: anlatımın bölüm içindeki başlangıcı (ms) */
  narrStartMs: number
  /** ETKİNLİK: anlatım sırasında klibin sesi: kısılır · kapanır · hep açık */
  duck: DuckMode
  /** ETKİNLİK: ana medyadan sonra gelen ek görsel / videolar (en çok 3), aralarında geçiş */
  extras: ListMedia[]
}
export const EXTRAS_MAX = 3
export interface MusicTrack {
  url: string
  name: string
  durationMs: number
  /** parçanın kullanılan başlangıcı (yüklemede kesilir) */
  startMs: number
}
export interface CardsState {
  status: 'none' | 'ready' | 'error'
  key: string
  urls: string[]
  error?: string | null
  updatedAt?: number
}
export const EMPTY_CARDS: CardsState = { status: 'none', key: '', urls: [] }
/** tek parça (geçişli) etkinlik videosu en çok bu kadar (Vercel süre sınırı) */
export const WHOLE_MAX_MS = 150_000
/** Müzik: fon müziği · yalnız videonun kendi sesi/müziği · müziksiz */
export const MUSIC_MODES = ['on', 'own', 'off'] as const
export type MusicMode = (typeof MUSIC_MODES)[number]
export const MUSIC_MODE_LABEL: Record<MusicMode, string> = { on: 'Fon müziği', own: 'Videonun kendi müziği', off: 'Müziksiz' }
export const DUCK_MODES = ['kisik', 'kapali', 'acik'] as const
export type DuckMode = (typeof DUCK_MODES)[number]
export const DUCK_LABEL: Record<DuckMode, string> = { kisik: 'Kısılır', kapali: 'Kapanır', acik: 'Hep açık' }
export interface EventInfo {
  eventId: string
  /** «28 Kasım Cuma» */
  date: string
  day: string
  mon: string
  /** «21.00» */
  time: string
  venue: string
  city: string
  category: string
  source: string
  price: string
  /** ISO başlangıç (geri sayım için) */
  startsAt?: string
}
export const WM_POSITIONS = ['sag-ust', 'sol-ust', 'sag-alt', 'sol-alt'] as const
export type WmPos = (typeof WM_POSITIONS)[number]
export const WM_POS_LABEL: Record<WmPos, string> = { 'sag-ust': 'Sağ üst', 'sol-ust': 'Sol üst', 'sag-alt': 'Sağ alt', 'sol-alt': 'Sol alt' }
export interface Watermark {
  text: string
  pos: WmPos
  /** 0.3–1 */
  opacity: number
}
export interface ListPublisher {
  name: string
  handle: string
  slogan: string
}
export interface SegmentRender {
  key: string
  url: string
  seconds: number
}
export interface ListProject {
  id: string
  title: string
  studio: Studio
  listType: ListType
  pack: ListPack
  aspect: ListAspect
  fit: 'cover' | 'blur'
  introTitle: string
  introSubtitle: string
  introAnnounce: string
  introVoice: ListVoice | null
  items: ListItem[]
  /** true: sondan başa (10 → 1) geri sayım */
  countdown: boolean
  publisher: ListPublisher
  voiceOn: boolean
  voiceId: AdVoiceId
  textOn: boolean
  textStyle: AdTextStyle
  textPos: ListTextPos
  textSize: number
  accent: string
  transition: ListTransition
  filter: FilterPreset
  bars: boolean
  zoomOn: boolean
  sfxOn: boolean
  clipSound: ClipSound
  platformLogoUrl: string | null
  logoPlacement: LogoPlacement
  /** paylaşım metni (boş = otomatik: başlık + sıralar + etiketler) */
  caption: string
  /** ETKİNLİK: yayınlanacak hesap (oluştururken seçilir) ve filigranı */
  accountId: string | null
  watermark: Watermark | null
  /** fon müziği: açık / kapalı (pakete göre hazır müzik) */
  music: MusicMode
  /** ETKİNLİK: şablon (kart ya da video) ve renkleri (vurgu = accent) */
  template: EventTemplate
  bgColor: string
  textColor: string
  /** fon müziği: hazır parça ('auto' = pakete göre) ya da yüklenen parça; ses düzeyi 0.05–1 */
  musicPreset: MusicPreset | 'auto'
  musicTrack: MusicTrack | null
  musicVolume: number
  /** ETKİNLİK: kart çıktısı (tek kare / kaydırmalı) */
  cards: CardsState
  segments: Record<string, SegmentRender>
  render: RenderState
  createdBy: string
  createdAt: number
  updatedAt: number
}

// ── yardımcılar ──────────────────────────────────────────────────────────────
export function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v)
}
const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : ''
const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null)
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v)

export function fnv(s: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 16777619)
    h2 = Math.imul(h2 ^ c, 2246822507)
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).slice(0, 16)
}

export function newListItem(title = '', subtitle = ''): ListItem {
  return { id: newItemId(), title, subtitle, change: 'none', prevRank: null, weeks: null, media: null, coverUrl: null, posX: 0, posY: 0, scale: 1, volume: 1, announce: '', voice: null, accent: null, specs: [], price: '', event: null, ownFirst: false, narrStartMs: 600, duck: 'kisik', extras: [] }
}

export function defaultList(id: string, uid: string, now: number, type: ListType = 'pop', count?: number): ListProject {
  const t = LIST_TYPE_INFO[type]
  const p = LIST_PACK_INFO[t.pack]
  const n = Math.max(1, Math.min(LIST_LIMITS.items, Math.round(count ?? t.count)))
  return {
    id,
    title: modeOf(type) === 'urun' ? t.label : `${t.label} ${n}`,
    studio: studioOf(type),
    listType: type,
    pack: t.pack,
    aspect: '9:16',
    fit: 'blur',
    introTitle: t.title,
    introSubtitle: '',
    introAnnounce: '',
    introVoice: null,
    items: Array.from({ length: n }, () => newListItem()),
    countdown: modeOf(type) === 'liste',
    publisher: { name: '', handle: '', slogan: 'Takip et · her hafta yeni liste' },
    voiceOn: true,
    voiceId: p.voice,
    textOn: true,
    textStyle: p.textStyle,
    textPos: 'alt',
    textSize: 64,
    accent: p.accent,
    transition: 'karisik',
    filter: p.filter,
    bars: p.bars,
    zoomOn: true,
    sfxOn: p.sfx !== null,
    clipSound: 'kisik',
    platformLogoUrl: null,
    logoPlacement: 'yok',
    caption: '',
    accountId: null,
    watermark: null,
    music: modeOf(type) === 'etkinlik' ? 'on' : 'off',
    template: 'v3-hafta',
    bgColor: TEMPLATE_INFO['v3-hafta'].bg,
    textColor: TEMPLATE_INFO['v3-hafta'].text,
    musicPreset: 'auto',
    musicTrack: null,
    musicVolume: 0.2,
    cards: { ...EMPTY_CARDS },
    segments: {},
    render: { ...EMPTY_RENDER },
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  }
}

export function withListDefaults(raw: Partial<ListProject> & { id: string }): ListProject {
  const d = defaultList(raw.id, raw.createdBy ?? '', raw.createdAt ?? 0, isOneOf(LIST_TYPES, raw.listType) ? raw.listType : 'pop', 1)
  return {
    ...d,
    ...raw,
    studio: isOneOf(STUDIOS, raw.studio) ? raw.studio : d.studio,
    publisher: { ...d.publisher, ...(raw.publisher ?? {}) },
    items: (raw.items ?? []).map((x) => ({ ...newListItem(), ...x })),
    segments: raw.segments ?? {},
    render: { ...EMPTY_RENDER, ...(raw.render ?? {}) },
    template: isOneOf(EVENT_TEMPLATES, raw.template) ? raw.template : d.template,
    cards: { ...EMPTY_CARDS, ...(raw.cards ?? {}) },
  }
}

/** Panodan yapıştırılan listeyi satırlara ayırır: «1. Sanatçı – Şarkı», «Şarkı - Sanatçı», «Film (2026)». */
export function parsePastedList(text: string, category: ListCategory): Array<{ title: string; subtitle: string }> {
  const out: Array<{ title: string; subtitle: string }> = []
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    let line = raw.replace(/\t+/g, ' ').trim()
    if (!line) continue
    // baştaki sıra numarası: «1.», «1)», «#1», «01 -»
    line = line.replace(/^#?\s*\d{1,3}\s*[.)\-:–—]?\s+/, '').trim()
    if (!line || /^(sıra|rank|#|no)\b/i.test(line)) continue
    const sep = line.match(/\s+[–—-]\s+/)
    if (sep && category === 'muzik') {
      const [a, ...rest] = line.split(sep[0])
      // müzik: «Sanatçı – Şarkı» (Spotify / Shazam dışa aktarımlarının çoğu); diğerleri «Ad – alt bilgi»
      out.push({ title: clean(rest.join(' - '), LIST_LIMITS.itemTitle), subtitle: clean(a, LIST_LIMITS.itemSub) })
    } else if (sep) {
      const [a, ...rest] = line.split(sep[0])
      out.push({ title: clean(a, LIST_LIMITS.itemTitle), subtitle: clean(rest.join(' - '), LIST_LIMITS.itemSub) })
    } else out.push({ title: clean(line, LIST_LIMITS.itemTitle), subtitle: '' })
    if (out.length >= LIST_LIMITS.items) break
  }
  return out.filter((x) => x.title)
}

// ── sıra ve süre ─────────────────────────────────────────────────────────────
/** Videoda gösterim sırası (geri sayımda N → 1). rank = listedeki yer (1 = zirve). */
export function playOrder(list: Pick<ListProject, 'items' | 'countdown'>): Array<{ item: ListItem; rank: number; index: number }> {
  const all = list.items.map((item, i) => ({ item, rank: i + 1, index: i }))
  return list.countdown ? all.reverse() : all
}

export const clipLenMs = (m: ListMedia | null): number => (m ? Math.max(0, m.outMs - m.inMs) : 0)

export function rankCardMs(item: Pick<ListItem, 'voice'>, voiceOn: boolean): number {
  const v = voiceOn && item.voice ? item.voice.durationMs + 500 : 0
  return Math.min(4_500, Math.max(RANK_CARD_MS, v))
}
export function introLayoutOf(list: Partial<Pick<ListProject, 'template' | 'listType'>>): IntroLayout {
  if (list.listType !== 'etkinlik' || !list.template || isCardTemplate(list.template)) return 'default'
  return TEMPLATE_INFO[list.template].intro ?? 'default'
}
export function introMs(list: Pick<ListProject, 'introVoice' | 'voiceOn'> & Partial<Pick<ListProject, 'template' | 'listType' | 'items'>>): number {
  const v = list.voiceOn && list.introVoice ? list.introVoice.durationMs + 700 : 0
  const lay = introLayoutOf(list)
  const n = list.items?.length ?? 0
  const need = lay === 'default' ? 0 : lay === 'gerisayim' || lay === 'ozet' ? 4_000 : Math.min(9_000, 2_600 + 550 * Math.min(n, 10))
  return Math.min(lay === 'default' ? 7_000 : 10_000, Math.max(INTRO_MS, v, need))
}

export type SegmentId = 'intro' | 'outro' | `i_${string}`
export const segOfItem = (id: string): SegmentId => `i_${id}`

/** sıranın girişine uygulanan geçiş («karışık»: paket listesinde dönüşümlü) */
export function transitionFor(list: Pick<ListProject, 'transition' | 'pack'>, playIndex: number): Transition {
  if (list.transition !== 'karisik') return list.transition
  const mix = LIST_PACK_INFO[list.pack].mix
  return mix[playIndex % mix.length] ?? 'fade'
}

/** ETKİNLİK: bölümün uzunluğu — klip aralığı; görselde anlatım sığacak kadar uzatılır. */
export function eventMainMs(list: Pick<ListProject, 'voiceOn'>, item: ListItem): number {
  if (!item.media) return 0
  const len = item.media.outMs - item.media.inMs
  if (item.media.kind !== 'image') return len
  const need = list.voiceOn && item.voice && !(item.extras ?? []).length ? item.narrStartMs + item.voice.durationMs + 1_200 : 0
  return Math.min(LIST_LIMITS.clipMaxMs, Math.max(len, need))
}
/** ETKİNLİK: bölümün uzunluğu = ana medya + ek medyalar (aralarında geçiş örtüşmesi düşülür) */
export function eventSectionMs(list: Pick<ListProject, 'voiceOn'>, item: ListItem): number {
  if (!item.media) return 0
  const extras = (item.extras ?? []).reduce((a, m) => a + Math.max(0, m.outMs - m.inMs) - TRANSITION_MS, 0)
  return eventMainMs(list, item) + extras
}

export function itemSegmentMs(list: ListProject, item: ListItem, playIndex: number): number {
  if (!item.media) return 0
  if (modeOf(list.listType) === 'etkinlik') return eventSectionMs(list, item)
  const clips = [
    { inMs: 0, outMs: rankCardMs(item, list.voiceOn), speed: 1, transition: 'none' as Transition },
    { inMs: item.media.inMs, outMs: item.media.outMs, speed: 1, transition: transitionFor(list, playIndex) },
  ]
  return timeline(clips).total
}

export function listTotalMs(list: ListProject): number {
  const items = playOrder(list).reduce((a, x, i) => a + itemSegmentMs(list, x.item, i), 0)
  return items ? introMs(list) + items + OUTRO_MS : 0
}

/** Platform uygunluğu (resmî belgelere göre, 27.11.2026): bilgi amaçlı rozet. */
export function platformFit(totalMs: number, aspect: ListAspect): Array<{ platform: string; ok: boolean; note: string }> {
  const min = totalMs / 60_000
  const vertical = aspect === '9:16' || aspect === '4:5' || aspect === '1:1'
  return [
    { platform: 'Instagram Reels', ok: min <= 3, note: min <= 3 ? 'Keşfette önerilebilir (≤ 3 dk)' : 'Uzun: yalnız takipçilere gösterilir; keşfet için ≤ 3 dk' },
    { platform: 'TikTok', ok: min <= 10, note: min <= 10 ? 'Uygun' : '10 dakikayı aşıyor' },
    { platform: 'YouTube', ok: true, note: vertical && min <= 3 ? 'Shorts olarak gider (≤ 3 dk, dikey/kare)' : 'Normal video olarak gider' },
    { platform: 'Facebook', ok: true, note: min <= 3 ? 'Reels olarak gider' : 'Video olarak gider' },
  ]
}

// ── anons metinleri (ücretsiz şablon; kullanıcı düzenleyebilir) ──────────────
const tr = (s: string) => s.toLocaleLowerCase('tr-TR')
export function defaultIntroAnnounce(list: Pick<ListProject, 'items' | 'listType' | 'pack' | 'introTitle'>): string {
  const n = list.items.length
  const t = LIST_TYPE_INFO[list.listType]
  if (modeOf(list.listType) === 'etkinlik') return `${list.introTitle || t.title} İşte kaçırmamanız gereken ${n} etkinlik!`
  if (modeOf(list.listType) === 'urun') {
    const name = list.introTitle && list.introTitle !== t.title ? list.introTitle : ''
    if (list.listType === 'tek-haber') return `Teknoloji dünyasında bugün… ${name || 'gündemdeki gelişme'}. İşte bilmeniz gerekenler.`
    return name ? `${name} karşınızda! İşte öne çıkan ${n} ${t.noun}.` : `Yeni teknoloji karşınızda! İşte öne çıkan ${n} ${t.noun}.`
  }
  if (t.category === 'teknoloji') return `${list.introTitle || t.title}… Top ${n} listesi başlıyor!`
  if (list.pack === 'fragman') return `Bu hafta… herkes bunları izledi. İşte ${t.noun === 'dizi' ? 'en çok izlenen' : 'zirvedeki'} ${n} ${t.noun}.`
  if (list.pack === 'lounge') return `İyi akşamlar… ${tr(list.introTitle || t.title)} için hazır mısınız? Haftanın ${n} ${t.noun}ı sizinle.`
  if (list.pack === 'genc') return `Hazır mısın? Haftanın en iyi ${n} ${t.noun}ı geliyor!`
  return `Merhaba! ${list.introTitle || t.title}… Top ${n} geri sayımı başlıyor!`
}

export function defaultAnnounce(list: Pick<ListProject, 'pack' | 'items' | 'listType'>, item: Pick<ListItem, 'title' | 'subtitle' | 'change' | 'prevRank' | 'weeks'> & Partial<Pick<ListItem, 'price'>>, rank: number): string {
  const n = list.items.length
  if (modeOf(list.listType) === 'etkinlik') return eventAnnounce(item as Partial<ListItem> & Pick<ListItem, 'title'>)
  if (modeOf(list.listType) === 'urun') {
    const sub = item.subtitle.replace(/[.!…]+$/, '')
    return sub ? `${item.title}… ${sub}.` : `${item.title}.`
  }
  if (LIST_TYPE_INFO[list.listType].category === 'teknoloji') {
    const brand = item.subtitle ? `${item.subtitle} ` : ''
    const price = item.price ? ` Fiyatı ${item.price}.` : ''
    const newTag = item.change === 'new' ? ' Listeye yeni girdi!' : ''
    return rank === 1 ? `Ve bir numara… ${brand}${item.title}!${price}${newTag}` : `${rank} numarada ${brand}${item.title}.${price}${newTag}`
  }
  const who = item.subtitle ? `${item.subtitle}, ` : ''
  const name = item.title ? `«${item.title}»` : ''
  const isTop = rank === 1
  const move =
    item.change === 'new' ? ' Listeye yeni giriş!' : item.change === 'up' && item.prevRank ? ` Geçen hafta ${item.prevRank}. sıradaydı, yükselişte!` : item.change === 'down' && item.prevRank ? ` Geçen hafta ${item.prevRank}. sıradaydı.` : item.weeks && item.weeks >= 3 ? ` ${item.weeks} haftadır listede!` : ''
  const sinema = LIST_TYPE_INFO[list.listType].category === 'sinema'
  if (list.pack === 'fragman') return isTop ? `Ve bu haftanın bir numarası… ${name}.${move}` : `${rank}. sırada… ${name}.${move}`
  if (list.pack === 'lounge') return isTop ? `Ve zirvede… ${who}${name}.${move}` : `${rank}. sırada ${who}${name}.${move}`
  if (list.pack === 'genc') return isTop ? `Ve bir numara… ${who}${name}!${move}` : `${rank}! ${who}${name}!${move}`
  if (isTop) return `Ve bu haftanın bir numarası… ${sinema ? '' : who}${name}!${move}`
  if (rank === n && n > 1) return `Listeye ${rank}. sıradan giriyoruz: ${who}${name}!${move}`
  return `${rank} numarada… ${who}${name}!${move}`
}

/** «21.00» → «21.00'de» (okunuşa göre bulunma eki) */
function timeAt(t: string): string {
  const m = t.match(/^(\d{1,2})[.:](\d{2})$/)
  if (!m) return t
  const n = Number(m[2]) || Number(m[1])
  const u = n % 10
  const units: Record<number, string> = { 1: "'de", 2: "'de", 3: "'te", 4: "'te", 5: "'te", 6: "'da", 7: "'de", 8: "'de", 9: "'da" }
  const tens: Record<number, string> = { 0: "'da", 10: "'da", 20: "'de", 30: "'da", 40: "'ta", 50: "'de" }
  return `${m[1]}.${m[2]}${u ? units[u] : (tens[n - u] ?? "'de")}`
}
/** ETKİNLİK anonsu (AI'sız): ad, gün, saat, mekân, bilet kaynağı. NaHaber adı geçmez. */
export function eventAnnounce(item: Partial<ListItem> & Pick<ListItem, 'title'>): string {
  const e = item.event
  if (!e) return item.title
  const parts = [`${item.title}!`, `${e.date}${e.time ? `, saat ${timeAt(e.time)}` : ''}${e.venue ? `, ${e.venue}` : ''}.`, e.price ? `Biletler ${e.price}.` : e.source ? `Biletler ${e.source} üzerinden satışta.` : '']
  return parts.filter(Boolean).join(' ').slice(0, LIST_LIMITS.announce)
}

/** Gemini TTS yönergesi (İngilizce yönerge en tutarlı sonucu verir; metin Türkçe okunur). */
export function listVoicePrompt(pack: ListPack, voice: AdVoiceId): string {
  const P = LIST_PACK_INFO[pack]
  return `Read this Turkish chart-countdown line as ${P.persona} (voice character: ${AD_VOICES[voice].desc}). Delivery: ${P.delivery}. Studio-quality, clear diction, correct Turkish pronunciation and stress; song and film titles may be English — pronounce them naturally. Do not add any words.`
}
export const listVoiceHash = (pack: ListPack, voice: AdVoiceId, text: string): string => fnv(JSON.stringify(['lv1', pack, voice, text.replace(/\s+/g, ' ').trim()]))
export const itemVoiceCurrent = (list: Pick<ListProject, 'pack' | 'voiceId'>, item: Pick<ListItem, 'announce' | 'voice'>) => !!item.voice && !!item.announce.trim() && item.voice.hash === listVoiceHash(list.pack, list.voiceId, item.announce)
export const introVoiceCurrent = (list: Pick<ListProject, 'pack' | 'voiceId' | 'introAnnounce' | 'introVoice'>) => !!list.introVoice && !!list.introAnnounce.trim() && list.introVoice.hash === listVoiceHash(list.pack, list.voiceId, list.introAnnounce)
/** seslendirilmesi gereken (ses yok ya da metin/ses değişmiş) satır sayısı */
export function voicesMissing(list: ListProject): number {
  if (!list.voiceOn) return 0
  return (list.introAnnounce.trim() && !introVoiceCurrent(list) ? 1 : 0) + list.items.filter((x) => x.announce.trim() && !itemVoiceCurrent(list, x)).length
}

// ── doğrulama / düzenleme ────────────────────────────────────────────────────
export type PatchResult = { ok: true; value: ListProject } | { ok: false; error: string }

function patchItem(cur: ListItem | undefined, x: Record<string, unknown>): ListItem | null {
  const base = cur ?? (isId(x.id) ? { ...newListItem(), id: x.id } : null)
  if (!base) return null
  const it: ListItem = { ...base }
  if ('title' in x) it.title = clean(x.title, LIST_LIMITS.itemTitle)
  if ('subtitle' in x) it.subtitle = clean(x.subtitle, LIST_LIMITS.itemSub)
  if ('change' in x && isOneOf(CHANGES, x.change)) it.change = x.change
  if ('prevRank' in x) it.prevRank = x.prevRank === null ? null : (num(x.prevRank, 1, 500) ?? it.prevRank)
  if ('weeks' in x) it.weeks = x.weeks === null ? null : (num(x.weeks, 1, 520) ?? it.weeks)
  if ('posX' in x) it.posX = num(x.posX, -1, 1) ?? it.posX
  if ('posY' in x) it.posY = num(x.posY, -1, 1) ?? it.posY
  if ('scale' in x) it.scale = num(x.scale, 1, 2) ?? it.scale
  if ('volume' in x) it.volume = num(x.volume, 0, 1) ?? it.volume
  if ('announce' in x) it.announce = typeof x.announce === 'string' ? x.announce.replace(/\s+/g, ' ').trim().slice(0, LIST_LIMITS.announce) : ''
  if ('accent' in x) it.accent = x.accent === null ? null : isColor(x.accent) ? x.accent : it.accent
  if ('price' in x) it.price = clean(x.price, 30)
  if ('ownFirst' in x) it.ownFirst = x.ownFirst === true
  if ('narrStartMs' in x) it.narrStartMs = Math.round(num(x.narrStartMs, 0, 60_000) ?? it.narrStartMs)
  if ('duck' in x && isOneOf(DUCK_MODES, x.duck)) it.duck = x.duck
  if ('extras' in x && Array.isArray(x.extras)) {
    // yalnız var olan ek medyalar sıralanır / kırpılır / çıkarılır (eklemek sunucuda)
    const byUrl = new Map((it.extras ?? []).map((m) => [m.url, m]))
    const next: ListMedia[] = []
    for (const r of x.extras as Array<Record<string, unknown>>) {
      const cur = r && typeof r.url === 'string' ? byUrl.get(r.url) : undefined
      if (!cur || next.some((m) => m.url === cur.url)) continue
      const max = cur.kind === 'image' ? LIST_LIMITS.clipMaxMs : (cur.durationMs ?? LIST_LIMITS.clipMaxMs)
      let inMs = cur.kind === 'image' ? 0 : Math.round(num(r.inMs, 0, max) ?? cur.inMs)
      let outMs = Math.round(num(r.outMs, 0, max) ?? cur.outMs)
      if (outMs - inMs > LIST_LIMITS.clipMaxMs) outMs = inMs + LIST_LIMITS.clipMaxMs
      if (outMs - inMs < 2_000) outMs = Math.min(max, inMs + 2_000)
      if (outMs - inMs < 2_000) inMs = Math.max(0, outMs - 2_000)
      next.push({ ...cur, inMs, outMs })
    }
    it.extras = next.slice(0, EXTRAS_MAX)
  }
  if ('event' in x && x.event && typeof x.event === 'object' && it.event) {
    const e = x.event as Record<string, unknown>
    it.event = { ...it.event, ...(typeof e.date === 'string' ? { date: clean(e.date, 40) } : {}), ...(typeof e.time === 'string' ? { time: clean(e.time, 20) } : {}), ...(typeof e.venue === 'string' ? { venue: clean(e.venue, 90) } : {}), ...(typeof e.price === 'string' ? { price: clean(e.price, 30) } : {}) }
  }
  if ('specs' in x && Array.isArray(x.specs))
    it.specs = (x.specs as Array<Record<string, unknown>>)
      .slice(0, 6)
      .map((r) => ({ label: clean(r?.label, 24), value: clean(r?.value, 60) }))
      .filter((r) => r.label || r.value)
  if ('coverUrl' in x && x.coverUrl === null) it.coverUrl = null
  if ('media' in x) {
    if (x.media === null) it.media = null
    else if (it.media && x.media && typeof x.media === 'object') {
      const m = x.media as Record<string, unknown>
      const max = it.media.kind === 'image' ? LIST_LIMITS.clipMaxMs : (it.media.durationMs ?? LIST_LIMITS.clipMaxMs)
      let inMs = Math.round(num(m.inMs, 0, max) ?? it.media.inMs)
      let outMs = Math.round(num(m.outMs, 0, max) ?? it.media.outMs)
      if (it.media.kind === 'image') inMs = 0
      if (outMs - inMs > LIST_LIMITS.clipMaxMs) outMs = inMs + LIST_LIMITS.clipMaxMs
      if (outMs - inMs < LIST_LIMITS.clipMinMs) outMs = Math.min(max, inMs + LIST_LIMITS.clipMinMs)
      if (outMs - inMs < LIST_LIMITS.clipMinMs) inMs = Math.max(0, outMs - LIST_LIMITS.clipMinMs)
      it.media = { ...it.media, inMs, outMs }
    }
  }
  return it
}

/** Kullanıcının düzenlediği alanları doğrular. Medya / ses / render URL'leri burada değişmez. */
export function applyListPatch(cur: ListProject, raw: Record<string, unknown>, now: number): PatchResult {
  const n: ListProject = { ...cur, publisher: { ...cur.publisher } }
  if ('title' in raw) n.title = clean(raw.title, LIST_LIMITS.title) || 'Liste'
  if ('listType' in raw) {
    if (!isOneOf(LIST_TYPES, raw.listType)) return { ok: false, error: 'Liste türü geçersiz' }
    if (studioOf(raw.listType) !== cur.studio) return { ok: false, error: 'Bu tür başka bir stüdyoya ait' }
    n.listType = raw.listType
  }
  if ('pack' in raw) {
    if (!isOneOf(LIST_PACKS, raw.pack)) return { ok: false, error: 'Sunum paketi geçersiz' }
    n.pack = raw.pack
  }
  if ('aspect' in raw) {
    if (!isOneOf(LIST_ASPECTS, raw.aspect)) return { ok: false, error: 'Biçim geçersiz' }
    n.aspect = raw.aspect
  }
  if ('fit' in raw) n.fit = raw.fit === 'cover' ? 'cover' : 'blur'
  if ('introTitle' in raw) n.introTitle = clean(raw.introTitle, 90)
  if ('introSubtitle' in raw) n.introSubtitle = clean(raw.introSubtitle, 60)
  if ('introAnnounce' in raw) n.introAnnounce = typeof raw.introAnnounce === 'string' ? raw.introAnnounce.replace(/\s+/g, ' ').trim().slice(0, LIST_LIMITS.announce) : ''
  if ('countdown' in raw) n.countdown = raw.countdown === true
  if ('voiceOn' in raw) n.voiceOn = raw.voiceOn === true
  if ('voiceId' in raw) {
    if (!isOneOf(AD_VOICE_IDS, raw.voiceId)) return { ok: false, error: 'Ses geçersiz' }
    n.voiceId = raw.voiceId
  }
  if ('textOn' in raw) n.textOn = raw.textOn === true
  if ('textStyle' in raw) {
    if (!isOneOf(AD_TEXT_STYLES, raw.textStyle)) return { ok: false, error: 'Yazı stili geçersiz' }
    n.textStyle = raw.textStyle
  }
  if ('textPos' in raw) {
    if (!isOneOf(TEXT_POSITIONS, raw.textPos)) return { ok: false, error: 'Yazı yeri geçersiz' }
    n.textPos = raw.textPos
  }
  if ('textSize' in raw) n.textSize = num(raw.textSize, 36, 110) ?? cur.textSize
  if ('accent' in raw) {
    if (!isColor(raw.accent)) return { ok: false, error: 'Renk geçersiz' }
    n.accent = raw.accent
  }
  if ('transition' in raw) {
    if (!isOneOf(LIST_TRANSITIONS, raw.transition)) return { ok: false, error: 'Geçiş geçersiz' }
    n.transition = raw.transition
  }
  if ('filter' in raw) {
    if (!isOneOf(FILTERS, raw.filter)) return { ok: false, error: 'Renk filtresi geçersiz' }
    n.filter = raw.filter
  }
  if ('bars' in raw) n.bars = raw.bars === true
  if ('zoomOn' in raw) n.zoomOn = raw.zoomOn === true
  if ('sfxOn' in raw) n.sfxOn = raw.sfxOn === true
  if ('clipSound' in raw) {
    if (!isOneOf(CLIP_SOUNDS, raw.clipSound)) return { ok: false, error: 'Klip sesi seçeneği geçersiz' }
    n.clipSound = raw.clipSound
  }
  if ('logoPlacement' in raw) {
    if (!isOneOf(LOGO_PLACEMENTS, raw.logoPlacement)) return { ok: false, error: 'Logo yerleşimi geçersiz' }
    n.logoPlacement = raw.logoPlacement
  }
  if ('platformLogoUrl' in raw && raw.platformLogoUrl === null) n.platformLogoUrl = null
  if ('music' in raw) n.music = isOneOf(MUSIC_MODES, raw.music) ? raw.music : 'off'
  if ('template' in raw) {
    if (!isOneOf(EVENT_TEMPLATES, raw.template)) return { ok: false, error: 'Şablon geçersiz' }
    if (raw.template !== n.template) {
      const T = TEMPLATE_INFO[raw.template]
      n.template = raw.template
      // şablon değişince renkler şablonun varsayılanına döner (aynı istekte renk de geldiyse o geçerli)
      if (!('accent' in raw)) n.accent = T.accent
      if (!('bgColor' in raw)) n.bgColor = T.bg
      if (!('textColor' in raw)) n.textColor = T.text
    }
  }
  if ('bgColor' in raw) {
    if (!isColor(raw.bgColor)) return { ok: false, error: 'Zemin rengi geçersiz' }
    n.bgColor = raw.bgColor
  }
  if ('textColor' in raw) {
    if (!isColor(raw.textColor)) return { ok: false, error: 'Yazı rengi geçersiz' }
    n.textColor = raw.textColor
  }
  if ('musicPreset' in raw) n.musicPreset = raw.musicPreset === 'auto' || isOneOf(MUSIC_PRESETS, raw.musicPreset) ? (raw.musicPreset as MusicPreset | 'auto') : n.musicPreset
  if ('musicVolume' in raw) n.musicVolume = num(raw.musicVolume, 0.05, 1) ?? n.musicVolume
  if ('musicTrack' in raw && raw.musicTrack === null) n.musicTrack = null
  if ('watermark' in raw) {
    if (raw.watermark === null) n.watermark = null
    else if (raw.watermark && typeof raw.watermark === 'object') {
      const w = raw.watermark as Record<string, unknown>
      const cur = n.watermark ?? { text: '', pos: 'sag-ust' as WmPos, opacity: 0.8 }
      n.watermark = { text: 'text' in w ? clean(w.text, 70) : cur.text, pos: isOneOf(WM_POSITIONS, w.pos) ? w.pos : cur.pos, opacity: num(w.opacity, 0.3, 1) ?? cur.opacity }
    }
  }
  if ('caption' in raw) n.caption = typeof raw.caption === 'string' ? raw.caption.replace(/\r/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 2200) : ''
  if ('publisher' in raw && raw.publisher && typeof raw.publisher === 'object') {
    const p = raw.publisher as Record<string, unknown>
    if ('name' in p) n.publisher.name = clean(p.name, 50)
    if ('handle' in p) n.publisher.handle = clean(p.handle, 40).replace(/^@+/, '')
    if ('slogan' in p) n.publisher.slogan = clean(p.slogan, 70)
  }
  if ('items' in raw) {
    if (!Array.isArray(raw.items)) return { ok: false, error: 'Sıra listesi geçersiz' }
    if (raw.items.length > LIST_LIMITS.items) return { ok: false, error: `En fazla ${LIST_LIMITS.items} sıra` }
    const byId = new Map(cur.items.map((x) => [x.id, x]))
    const seen = new Set<string>()
    const next: ListItem[] = []
    for (const x of raw.items as Array<Record<string, unknown>>) {
      if (!x || typeof x !== 'object') continue
      const id = String(x.id ?? '')
      if (seen.has(id)) continue
      const it = patchItem(byId.get(id), x)
      if (!it) continue
      seen.add(it.id)
      next.push(it)
    }
    if (!next.length) return { ok: false, error: 'Listede en az 1 sıra olmalı' }
    n.items = next
  }
  n.updatedAt = now
  return { ok: true, value: n }
}

// ── üretim kontrolü ──────────────────────────────────────────────────────────
export function itemProblem(list: ListProject, item: ListItem, rank: number): string | null {
  if (!item.title.trim()) return `${rank}. sıranın adı boş`
  if (!item.media) return `${rank}. sıra (${item.title}) için klip / fragman yüklenmedi`
  if (list.voiceOn && item.announce.trim() && !itemVoiceCurrent(list, item)) return `${rank}. sıranın anonsu değişti — «Sunum» adımında «Seslendirmeleri oluştur»`
  return null
}
export function listRenderProblem(list: ListProject): string | null {
  if (!list.items.length) return 'Listede sıra yok'
  if (list.listType === 'etkinlik' && isCardTemplate(list.template)) return 'Bu bir kart şablonu — «Kartları üret» ile görsel üretin'
  for (const { item, rank } of playOrder(list)) {
    const p = itemProblem(list, item, rank)
    if (p) return p
  }
  if (list.voiceOn && list.introAnnounce.trim() && !introVoiceCurrent(list)) return 'Giriş anonsu değişti — «Sunum» adımında «Seslendirmeleri oluştur»'
  if (!list.publisher.name.trim() && !list.publisher.handle.trim()) return 'Kapanış kartı için yayıncı (sayfa) adını yazın'
  if (listTotalMs(list) > LIST_LIMITS.totalMs) return 'Video en fazla 15 dakika olabilir'
  return null
}
/** yumuşak uyarılar (üretimi engellemez) */
export function listWarnings(list: ListProject): string[] {
  const w: string[] = []
  for (const { item, rank } of playOrder(list)) {
    const len = clipLenMs(item.media)
    const min = list.studio === 'teknoloji' ? 6_000 : LIST_LIMITS.softMinMs
    if (item.media && (len < min || len > LIST_LIMITS.softMaxMs)) w.push(`${rank}. ${modeOf(list.listType) === 'urun' ? 'bölüm' : 'sıra'} klibi ${Math.round(len / 1000)} sn (önerilen ${min / 1000}–30 sn)`)
  }
  return w
}

// ── parçalar ve KURGU'ya derleme ─────────────────────────────────────────────
export type ListOverlay =
  | { type: 'ad'; o: AdOverlay }
  | { type: 'rank'; rank: number; total: number; title: string; subtitle: string; change: RankChange; prevRank: number | null; weeks: number | null; accent: string; look: RankLook; category: ListCategory; mode?: ListMode; price?: string }
  | { type: 'specs'; specs: Array<{ label: string; value: string }>; price: string; accent: string; look: RankLook; vertical: boolean }
  | { type: 'evtitle'; title: string; category: string; accent: string; look: RankLook }
  | { type: 'evcard'; title: string; date: string; day: string; mon: string; time: string; venue: string; category: string; price: string; source: string; accent: string; look: RankLook }
  | { type: 'wm'; text: string; pos: WmPos; opacity: number }
  | { type: 'evintro'; variant: IntroLayout; title: string; subtitle: string; rows: EvRow[]; accent: string; bg: string; text: string; days: number | null; city: string }
  | { type: 'evbig'; title: string; date: string; time: string; city: string; venue: string; accent: string; text: string }
  | { type: 'evmin'; title: string; date: string; venue: string; city: string; accent: string; text: string }
  | { type: 'evword'; word: string; accent: string; text: string; size: number }
  | { type: 'evbar'; title: string; date: string; time: string; venue: string; accent: string; bg: string; text: string }
  | { type: 'evsub'; text: string; accent: string }
  | { type: 'intro'; n: number; title: string; subtitle: string; handle: string; accent: string; look: RankLook; logoUrl: string | null; kicker?: string }
  | { type: 'outro'; name: string; handle: string; slogan: string; accent: string }
  | { type: 'badge'; rank: number; accent: string; logoUrl: string | null }

export interface EvRow {
  title: string
  date: string
  day: string
  mon: string
  dayShort: string
  time: string
  venue: string
  city: string
}
export function evRows(list: Pick<ListProject, 'items'>): EvRow[] {
  return list.items.map((x) => ({ title: x.title, date: x.event?.date ?? '', day: x.event?.day ?? '', mon: x.event?.mon ?? '', dayShort: dayShort(x.event?.date ?? ''), time: x.event?.time ?? '', venue: x.event?.venue || x.subtitle, city: x.event?.city ?? '' }))
}
/** geri sayım: ilk etkinliğe kalan gün (projenin son güncellendiği güne göre; anahtar kararlı kalsın) */
export function daysLeft(list: Pick<ListProject, 'items' | 'updatedAt'>): number | null {
  const first = list.items.map((x) => (x.event?.startsAt ? Date.parse(x.event.startsAt) : NaN)).filter(Number.isFinite).sort((a, b) => a - b)[0]
  if (first === undefined) return null
  const day = 86_400_000
  return Math.max(0, Math.round((Math.floor((first + 3 * 3_600_000) / day) - Math.floor((list.updatedAt + 3 * 3_600_000) / day))))
}

export interface CompiledSegment {
  id: SegmentId
  project: EditProject
  overlays: Map<string, ListOverlay>
  sfx: Array<{ name: SfxName; atMs: number }>
  duck: boolean
}

/** parçaların videodaki sırası */
export function segmentIds(list: ListProject): SegmentId[] {
  return ['intro', ...playOrder(list).map((x) => segOfItem(x.item.id)), 'outro']
}

function baseClip(id: string, assetId: string, inMs: number, outMs: number, fit: VideoClip['fit'], extra: Partial<VideoClip> = {}): VideoClip {
  return { id, assetId, inMs, outMs, speed: 1, volume: 0, mute: true, crop: null, rotate: 0, flipH: false, scale: 1, posX: 0, posY: 0, fit, brightness: 0, contrast: 1, saturation: 1, filter: 'none', transition: 'none', animIn: 'none', animOut: 'none', ...extra }
}

function itemAssets(item: ListItem, key: string, createdAt: number): EditAsset[] {
  const out: EditAsset[] = []
  if (item.media) out.push({ id: `${key}m`, kind: item.media.kind, source: 'upload', url: item.media.url, name: item.media.name, durationMs: item.media.durationMs, posterUrl: null, addedAt: createdAt })
  if (item.coverUrl) out.push({ id: `${key}c`, kind: 'image', source: 'upload', url: item.coverUrl, name: 'Kapak', durationMs: null, posterUrl: null, addedAt: createdAt })
  return out
}

/** bir öğenin arka plan klibi (giriş / kapanış / sıra kartı için): kapak, yoksa klibin başı */
function backdrop(item: ListItem, key: string, ms: number, extra: Partial<VideoClip>): VideoClip | null {
  if (item.coverUrl) return baseClip(`${key}bg`, `${key}c`, 0, ms, 'blur', extra)
  if (item.media) {
    const from = item.media.kind === 'image' ? 0 : item.media.inMs
    return baseClip(`${key}bg`, `${key}m`, from, from + Math.min(ms, Math.max(500, item.media.kind === 'image' ? ms : (item.media.durationMs ?? ms) - from)), 'blur', extra)
  }
  return null
}

export function compileSegment(list: ListProject, seg: SegmentId, sfxUrl: (n: SfxName) => string | null = () => null): CompiledSegment | null {
  const order = playOrder(list)
  const P = LIST_PACK_INFO[list.pack]
  const T = LIST_TYPE_INFO[list.listType]
  const overlays = new Map<string, ListOverlay>()
  const texts: TextItem[] = []
  const audio: AudioItem[] = []
  const assets: EditAsset[] = []
  const sfx: Array<{ name: SfxName; atMs: number }> = []
  const push = (id: string, startMs: number, endMs: number, o: ListOverlay) => {
    if (endMs - startMs < 200) return
    overlays.set(id, o)
    texts.push({ id, text: o.type, startMs, endMs, style: 'sade', x: 0.5, y: 0.5, size: 60, color: '#FFFFFF' })
  }
  const addSfx = (name: SfxName | null, atMs: number) => {
    if (!list.sfxOn || !name) return
    const url = sfxUrl(name)
    if (!url) return
    const aid = `sfx_${name}`
    if (!assets.some((a) => a.id === aid)) assets.push({ id: aid, kind: 'audio', source: 'upload', url, name, durationMs: null, posterUrl: null, addedAt: list.createdAt })
    audio.push({ id: `a_${name}_${atMs}`, kind: 'music', assetId: aid, music: null, text: null, startMs: atMs, endMs: null, volume: 0.55, fade: false })
    sfx.push({ name, atMs })
  }
  const addVoice = (v: ListVoice | null, atMs: number) => {
    if (!list.voiceOn || !v) return
    assets.push({ id: 'voice', kind: 'audio', source: 'tts', url: v.url, name: 'Anons', durationMs: v.durationMs, posterUrl: null, addedAt: v.createdAt })
    audio.push({ id: 'a_voice', kind: 'voice', assetId: 'voice', music: null, text: null, startMs: atMs, endMs: atMs + v.durationMs, volume: 1, fade: false })
  }
  const logo = list.platformLogoUrl && list.logoPlacement !== 'yok' ? list.platformLogoUrl : null
  let clips: VideoClip[] = []
  let duck = false
  const etk = modeOf(list.listType) === 'etkinlik'
  const bed = P.textStyle === 'zarif' ? 'akustik' : P.rankLook === 'neon' ? 'enerjik' : 'modern'
  const addMusic = (fromMs: number) => {
    if (list.music !== 'on') return
    const vol = Math.max(0.05, Math.min(1, list.voiceOn ? (list.musicVolume ?? 0.2) * 0.6 : (list.musicVolume ?? 0.2) * 1.7))
    if (list.musicTrack) {
      if (!assets.some((a) => a.id === 'mtrack')) assets.push({ id: 'mtrack', kind: 'audio', source: 'upload', url: list.musicTrack.url, name: list.musicTrack.name, durationMs: list.musicTrack.durationMs, posterUrl: null, addedAt: list.createdAt })
      audio.push({ id: 'a_music', kind: 'music', assetId: 'mtrack', music: null, text: null, startMs: fromMs, endMs: null, volume: vol, fade: true })
      return
    }
    const preset = list.musicPreset && list.musicPreset !== 'auto' ? list.musicPreset : bed
    audio.push({ id: 'a_music', kind: 'music', assetId: null, music: preset, text: null, startMs: fromMs, endMs: null, volume: vol, fade: true })
  }
  const TI = etk ? TEMPLATE_INFO[list.template] : null
  const colors = { accent: list.accent, bg: list.bgColor ?? '#0b0b10', text: list.textColor ?? '#ffffff' }
  const addWatermark = (end: number) => {
    if (list.watermark?.text) push('o_wm', 0, end, { type: 'wm', text: list.watermark.text, pos: list.watermark.pos, opacity: list.watermark.opacity })
  }

  if (seg === 'intro' || seg === 'outro') {
    const ref = seg === 'intro' ? order[0] : order[order.length - 1]
    if (!ref) return null
    const ms = seg === 'intro' ? introMs(list) : OUTRO_MS
    assets.push(...itemAssets(ref.item, 'r', list.createdAt))
    const bg = backdrop(ref.item, 'r', ms, { filter: list.filter, animIn: list.zoomOn ? 'zoom' : 'fade', brightness: -0.05 })
    if (!bg) return null
    clips = [bg]
    if (seg === 'intro') {
      const kicker = etk ? 'ETKİNLİK' : modeOf(list.listType) === 'urun' ? (list.listType === 'tek-haber' ? 'TEKNOLOJİ' : 'YENİ') : `TOP ${list.items.length}`
      const lay = introLayoutOf(list)
      if (etk && lay !== 'default') push('o_intro', 0, ms, { type: 'evintro', variant: lay, title: list.introTitle || T.title, subtitle: list.introSubtitle, rows: evRows(list), accent: colors.accent, bg: colors.bg, text: colors.text, days: lay === 'gerisayim' ? daysLeft(list) : null, city: list.items.find((x) => x.event?.city)?.event?.city ?? '' })
      else push('o_intro', 0, ms, { type: 'intro', n: list.items.length, title: list.introTitle || T.title, subtitle: list.introSubtitle, handle: list.publisher.handle, accent: list.accent, look: P.rankLook, logoUrl: logo, kicker })
      addSfx(list.pack === 'fragman' ? 'whoosh-down' : 'intro-zoom', 0)
      if (list.voiceOn && list.introAnnounce.trim() && introVoiceCurrent(list)) addVoice(list.introVoice, 450)
      if (etk) {
        addWatermark(ms)
        addMusic(0)
      }
    } else {
      push('o_outro', 0, ms, { type: 'outro', name: list.publisher.name, handle: list.publisher.handle, slogan: list.publisher.slogan, accent: list.accent })
      addSfx('outro-follow', 0)
      if (etk) addMusic(0)
    }
  } else if (etk) {
    // ETKİNLİK: tek klip; önce klibin kendi sesi (ör. konser), anlatım seçilen saniyede başlar
    const at = order.findIndex((x) => segOfItem(x.item.id) === seg)
    const x = order[at]
    if (!x || !x.item.media) return null
    const { item } = x
    const media = x.item.media
    const accent = item.accent ?? list.accent
    const mainMs = eventMainMs(list, item)
    const total = eventSectionMs(list, item)
    const narr = Math.max(0, Math.min(item.narrStartMs, Math.max(0, total - 1_500)))
    // müziksiz: klip sessiz · kendi müziği: yalnız klibin sesi · fon müziği: klip sesi + fon (anlatımda kısılır)
    const own = list.music === 'off' ? 0 : item.volume
    const isImg = media.kind === 'image'
    const common = { volume: own, mute: own === 0, scale: item.scale, posX: item.posX, posY: item.posY, filter: list.filter, contrast: 1 }
    assets.push({ id: 'rm', kind: media.kind, source: 'upload', url: media.url, name: media.name, durationMs: media.durationMs, posterUrl: null, addedAt: list.createdAt })
    if (isImg) {
      clips = [baseClip('rm', 'rm', 0, mainMs, list.fit, { ...common, animIn: list.zoomOn ? 'zoom' : 'fade', animOut: 'none' })]
    } else if (list.voiceOn && item.duck === 'kapali' && narr >= 800 && narr < mainMs - 800) {
      // anlatım başlayınca klibin sesi kesilir: iki parça (ikincisi sessiz)
      clips = [
        baseClip('rm1', 'rm', media.inMs, media.inMs + narr, list.fit, { ...common, animIn: 'fade' }),
        { ...baseClip('rm2', 'rm', media.inMs + narr, media.outMs, list.fit, { ...common, volume: 0, mute: true }), transition: 'none' },
      ]
    } else {
      clips = [baseClip('rm', 'rm', media.inMs, media.outMs, list.fit, { ...common, animIn: 'fade' })]
    }
    // ek medyalar: aralarında pakete / seçime göre geçiş; anlatım başladıysa ek videoların sesi kısık
    ;(item.extras ?? []).slice(0, EXTRAS_MAX).forEach((m, k) => {
      const aid = `rx${k}`
      assets.push({ id: aid, kind: m.kind, source: 'upload', url: m.url, name: m.name, durationMs: m.durationMs, posterUrl: null, addedAt: list.createdAt })
      const vol = list.voiceOn && item.duck !== 'acik' ? Math.min(own, 0.25) : own
      clips.push({ ...baseClip(aid, aid, m.kind === 'image' ? 0 : m.inMs, m.kind === 'image' ? m.outMs - m.inMs : m.outMs, list.fit, { ...common, volume: vol, mute: vol === 0, animIn: m.kind === 'image' && list.zoomOn ? 'zoom' : 'none' }), transition: transitionFor(list, at + k + 1) === 'none' ? 'fade' : transitionFor(list, at + k + 1) })
    })
    if (clips.length) clips[clips.length - 1] = { ...clips[clips.length - 1]!, animOut: 'fade' }
    const end = timeline(clips).total
    const e = item.event
    const sec = TI?.section ?? 'kart'
    const card = { type: 'evcard' as const, title: item.title, date: e?.date ?? '', day: e?.day ?? '', mon: e?.mon ?? '', time: e?.time ?? '', venue: e?.venue ?? item.subtitle, category: e?.category ?? '', price: e?.price || item.price, source: e?.source ?? '', accent, look: P.rankLook }
    if (sec === 'tektarih') {
      push('o_big', 400, end, { type: 'evbig', title: item.title, date: e?.date ?? '', time: e?.time ?? '', city: e?.city ?? '', venue: e?.venue ?? item.subtitle, accent, text: colors.text })
    } else if (sec === 'minimal') {
      push('o_min', 300, end, { type: 'evmin', title: item.title, date: e?.date ?? '', venue: e?.venue ?? item.subtitle, city: e?.city ?? '', accent, text: colors.text })
    } else if (sec === 'kinetik') {
      const words = [dayLong(e?.date ?? '') || 'BU HAFTA', (e?.category || 'ETKİNLİK').toLocaleUpperCase('tr-TR'), item.title.toLocaleUpperCase('tr-TR')].filter(Boolean)
      const step = 750
      words.forEach((w, k) => push(`o_w${k}`, 150 + k * step, 150 + (k + 1) * step, { type: 'evword', word: w, accent: k === 1 ? accent : colors.text, text: colors.text, size: k === 2 ? 0.8 : 1 }))
      push('o_card', 150 + words.length * step, end, card)
    } else if (sec === 'altyazi') {
      push('o_bar', 200, end, { type: 'evbar', title: item.title, date: e?.date ?? '', time: e?.time ?? '', venue: e?.venue ?? item.subtitle, accent, bg: colors.bg, text: colors.text })
      const chunks = subtitleChunks(item.announce)
      const vms = list.voiceOn && item.voice && itemVoiceCurrent(list, item) ? item.voice.durationMs : Math.max(2_000, end - narr - 600)
      const per = chunks.length ? vms / chunks.length : 0
      chunks.forEach((c, k) => push(`o_s${k}`, Math.round(narr + k * per), Math.round(Math.min(end, narr + (k + 1) * per)), { type: 'evsub', text: c, accent }))
    } else {
      if (list.textOn && narr >= 1_500) push('o_evt', 300, narr, { type: 'evtitle', title: item.title, category: e?.category ?? '', accent, look: P.rankLook })
      push('o_card', Math.max(0, narr - 200), end, card)
    }
    if (logo && list.logoPlacement !== 'yok') push('o_logo', 0, end, { type: 'ad', o: { type: 'logo', url: logo, pos: 'sol-alt' } })
    addWatermark(end)
    if (at === 0 || !item.ownFirst) addSfx(P.sfx, 0)
    if (list.voiceOn && item.announce.trim() && itemVoiceCurrent(list, item)) {
      addVoice(item.voice, narr)
      duck = item.duck === 'kisik'
    }
    // müzik: klibin kendi sesi önce çalıyorsa anlatımla birlikte girer; hep açık seste müzik yok
    const hasOwnAudio = media.kind === 'video' && media.hasAudio !== false && own > 0
    if (!(hasOwnAudio && item.duck === 'acik')) addMusic(hasOwnAudio && item.ownFirst ? narr : 0)
  } else {
    const at = order.findIndex((x) => segOfItem(x.item.id) === seg)
    const x = order[at]
    if (!x || !x.item.media) return null
    const { item, rank } = x
    const media = x.item.media
    const accent = item.accent ?? list.accent
    const cardMs = rankCardMs(item, list.voiceOn)
    assets.push(...itemAssets(item, 'r', list.createdAt))
    const card = backdrop(item, 'r', cardMs, { filter: list.filter, animIn: list.zoomOn ? 'zoom' : 'none', brightness: -0.06 })
    if (!card) return null
    const own = list.clipSound === 'kapali' ? 0 : item.volume
    const main = baseClip('rm', 'rm', media.inMs, media.outMs, list.fit, {
      assetId: 'rm',
      volume: own,
      mute: own === 0,
      scale: item.scale,
      posX: item.posX,
      posY: item.posY,
      filter: list.filter,
      contrast: list.filter === 'sinema' ? 1.06 : 1,
      transition: transitionFor(list, at),
      animOut: 'fade',
    })
    main.assetId = 'rm'
    clips = [card, main]
    const tl = timeline(clips)
    const mainStart = tl.starts[1]!
    const end = tl.total
    const mode = modeOf(list.listType)
    push('o_rank', 0, Math.min(end, cardMs), { type: 'rank', rank, total: list.items.length, title: item.title, subtitle: item.subtitle, change: item.change, prevRank: item.prevRank, weeks: item.weeks, accent, look: P.rankLook, category: T.category, mode, price: item.price })
    if (item.specs.length || item.price) push('o_specs', mainStart + 500, Math.min(end, mainStart + 9_500), { type: 'specs', specs: item.specs, price: item.price, accent, look: P.rankLook, vertical: list.aspect !== '16:9' })
    if (list.bars) push('o_bars', 0, end, { type: 'ad', o: { type: 'deco', deco: { kind: 'bars' } } })
    if (list.textOn) {
      const label = mode === 'urun' ? item.title : item.subtitle ? `${item.title} – ${item.subtitle}` : item.title
      const tag = mode === 'urun' ? String(rank).padStart(2, '0') : `#${rank}`
      // özellik kartı varken alt bant üstte durur (çakışmasın)
      const pos = item.specs.length && list.textPos === 'alt' ? 'ust' : list.textPos
      push('o_lower', mainStart + 300, Math.min(end, mainStart + 7_000), { type: 'ad', o: { type: 'text', style: list.textStyle, text: `${tag}  ${label}`, emphasis: tag, pos, size: list.textSize, accent } })
    }
    if (mode === 'liste') push('o_badge', mainStart + 300, end, { type: 'badge', rank, accent, logoUrl: list.logoPlacement === 'rozet' ? logo : null })
    if (logo && list.logoPlacement === 'kose') push('o_logo', 0, end, { type: 'ad', o: { type: 'logo', url: logo, pos: 'sag-ust' } })
    addSfx(P.sfx, 0)
    if (list.voiceOn && item.announce.trim() && itemVoiceCurrent(list, item)) {
      addVoice(item.voice, 250)
      duck = list.clipSound === 'kisik'
    }
    addWatermark(end)
  }

  const project: EditProject = {
    id: `ls_${list.id}_${seg}`,
    title: `${list.title} · ${seg}`,
    caption: '',
    aspect: list.aspect,
    assets,
    clips,
    texts,
    audio,
    closing: false, // LİSTE: NaHaber kapanışı ASLA yok
    linkedNewsId: null,
    newsVideo: false,
    newsApplied: null,
    render: { ...EMPTY_RENDER },
    createdBy: list.createdBy,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  }
  return { id: seg, project, overlays, sfx, duck }
}

/** Parçanın içeriğini belirleyen her şeyin özeti (değişmeyen parça yeniden üretilmez). */
export function segmentKey(list: ListProject, seg: SegmentId): string {
  const c = compileSegment(list, seg, (n) => n)
  if (!c) return 'none'
  return fnv(JSON.stringify(['lseg2', list.aspect, c.project.clips, c.project.assets.map((a) => a.url), c.project.audio, c.project.texts.map((t) => [t.id, t.startMs, t.endMs]), [...c.overlays.entries()], c.duck]))
}
export function listRenderKey(list: ListProject): string {
  return fnv(JSON.stringify(['lfin1', segmentIds(list).map((s) => segmentKey(list, s))]))
}
// ── ETKİNLİK: tek parça (geçişli) video ─────────────────────────────────────
/** etkinlik videosunun tek parça (bölümler arası gerçek geçişli) üretilebileceği durum */
export function wholeEligible(list: ListProject): boolean {
  return list.listType === 'etkinlik' && !isCardTemplate(list.template) && listTotalMs(list) <= WHOLE_MAX_MS
}
/** paylaşılan / gösterilen videonun geçerli anahtarı: tek parça ya da birleştirilmiş parçalar */
export function effectiveRenderKey(list: ListProject): string {
  return wholeEligible(list) ? wholeRenderKey(list) : listRenderKey(list)
}
export function wholeRenderKey(list: ListProject): string {
  return fnv(JSON.stringify(['lwhole1', list.aspect, list.transition, list.pack, segmentIds(list).map((s) => segmentKey(list, s))]))
}
/**
 * Bütün parçaları tek KURGU projesinde birleştirir: her parçanın ilk klibine geçiş verilir,
 * kaplama / ses zamanları parçanın başlangıcına kaydırılır, kimlikler parça önekiyle ayrılır.
 * Fon müziği tek parça olarak baştan sona çalar.
 */
export function compileWhole(list: ListProject, sfxUrl: (n: SfxName) => string | null = () => null): CompiledSegment | null {
  const parts = segmentIds(list).map((s) => compileSegment(list, s, sfxUrl))
  if (parts.some((p) => !p)) return null
  const clips: VideoClip[] = []
  const texts: TextItem[] = []
  const audio: AudioItem[] = []
  const assets: EditAsset[] = []
  const overlays = new Map<string, ListOverlay>()
  const sfx: Array<{ name: SfxName; atMs: number }> = []
  let duck = false
  let musicItem: AudioItem | null = null
  parts.forEach((c, i) => {
    const pre = `s${i}_`
    const pc = c!.project
    const startIdx = clips.length
    pc.clips.forEach((cl, k) => {
      const tr: Transition = k === 0 ? (i === 0 ? 'none' : transitionFor(list, i - 1)) : cl.transition
      clips.push({ ...cl, id: pre + cl.id, assetId: pre + cl.assetId, transition: tr, animIn: k === 0 && i > 0 && tr !== 'none' ? 'none' : cl.animIn, animOut: k === pc.clips.length - 1 && i < parts.length - 1 ? 'none' : cl.animOut })
    })
    const off = timeline(clips).starts[startIdx] ?? 0
    for (const a of pc.assets) if (!assets.some((x) => x.id === pre + a.id)) assets.push({ ...a, id: pre + a.id })
    for (const t of pc.texts) {
      texts.push({ ...t, id: pre + t.id, startMs: t.startMs + off, endMs: t.endMs + off })
      const o = c!.overlays.get(t.id)
      if (o) overlays.set(pre + t.id, o)
    }
    for (const a of pc.audio) {
      if (a.id === 'a_music') {
        if (!musicItem) musicItem = { ...a, id: 'a_music', assetId: a.assetId ? pre + a.assetId : null, startMs: a.startMs + off, endMs: null }
        continue
      }
      audio.push({ ...a, id: pre + a.id, assetId: a.assetId ? pre + a.assetId : null, startMs: a.startMs + off, endMs: a.endMs === null ? null : a.endMs + off })
    }
    for (const x of c!.sfx) sfx.push({ name: x.name, atMs: x.atMs + off })
    duck = duck || c!.duck
  })
  if (musicItem) audio.push(musicItem)
  const first = parts[0]!.project
  const project: EditProject = { ...first, id: `ep${fnv(list.id + 'whole').slice(0, 16)}`, clips, texts, audio, assets }
  return { id: 'intro', project, overlays, sfx, duck }
}

/** Kart çıktısının anahtarı (içerik değişmeden yeniden üretilmez). */
export function cardsKey(list: ListProject): string {
  return fnv(JSON.stringify(['lcard1', list.template, list.accent, list.bgColor, list.textColor, list.aspect, list.introTitle, list.introSubtitle, list.publisher, list.watermark, list.items.map((x) => [x.title, x.subtitle, x.event, x.media?.url ?? null, x.media?.kind ?? null, x.media?.inMs ?? 0, x.coverUrl])]))
}
export function cardsProblem(list: ListProject): string | null {
  if (list.listType !== 'etkinlik' || !isCardTemplate(list.template)) return 'Kart şablonu seçin'
  if (!list.items.length) return 'Etkinlik yok'
  const empty = list.items.findIndex((x) => !x.title.trim())
  if (empty >= 0) return `${empty + 1}. etkinliğin adı boş`
  return null
}

/** üretilmesi gereken parçalar (hazır olanlar atlanır) */
export function segmentsToRender(list: ListProject): SegmentId[] {
  return segmentIds(list).filter((s) => list.segments[s]?.key !== segmentKey(list, s))
}

// ── paylaşım ─────────────────────────────────────────────────────────────────
export const SHARE_PLATFORMS = ['instagram', 'facebook', 'threads', 'youtube'] as const
export type SharePlatform = (typeof SHARE_PLATFORMS)[number]
export type ShareFormat = 'reel' | 'video_story'
export const SHARE_PLATFORM_NAME: Record<SharePlatform, string> = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', youtube: 'YouTube' }
/**
 * Paylaşım sınırları (API ile yükleme): Instagram Reels ≤ 15 dk, Facebook Reels ≤ 90 sn,
 * Threads ≤ 5 dk, YouTube: dikey ≤ 3 dk Short, daha uzun / yatay normal video (≤ 700 MB).
 * Hikâye: Instagram / Facebook ≤ 60 sn.
 */
export const SHARE_LIMITS: Record<SharePlatform, { reelMaxSec: number; storyMaxSec: number | null }> = {
  instagram: { reelMaxSec: 15 * 60, storyMaxSec: 60 },
  facebook: { reelMaxSec: 90, storyMaxSec: 60 },
  threads: { reelMaxSec: 300, storyMaxSec: null },
  youtube: { reelMaxSec: 15 * 60, storyMaxSec: null },
}
const dk = (s: number) => (s >= 120 ? `${s / 60} dk` : `${s} sn`)

/** Bu liste videosu bu platform/biçimde paylaşılamıyorsa nedeni (null = uygun). */
export function listShareProblem(list: Pick<ListProject, 'render' | 'aspect'> & Partial<ListProject>, platform: SharePlatform, format: ShareFormat, currentKey?: string): string | null {
  if (list.render.status !== 'ready' || !list.render.outputUrl) return 'Önce videoyu üretin'
  if (currentKey && list.render.key !== currentKey) return 'Liste değişti — önce videoyu yeniden üretin'
  const sec = list.render.seconds ?? 0
  const lim = SHARE_LIMITS[platform]
  if (format === 'video_story') {
    if (lim.storyMaxSec === null) return `${SHARE_PLATFORM_NAME[platform]} video hikâyesi desteklemez`
    if (list.aspect !== '9:16') return 'Hikâye için 9:16 biçim gerekli'
    return sec > lim.storyMaxSec ? `${SHARE_PLATFORM_NAME[platform]} hikâyesi en fazla ${lim.storyMaxSec} sn` : null
  }
  if (sec > lim.reelMaxSec) return `${SHARE_PLATFORM_NAME[platform]} için en fazla ${dk(lim.reelMaxSec)}`
  if ((platform === 'instagram' || platform === 'facebook' || platform === 'threads') && list.aspect === '16:9') return `${SHARE_PLATFORM_NAME[platform]} Reels için dikey / kare biçim gerekli`
  return null
}

/** YouTube: dikey/kare ≤ 3 dk → Short, aksi hâlde normal video. */
export const youtubeIsLong = (list: Pick<ListProject, 'render' | 'aspect'>): boolean => list.aspect === '16:9' || (list.render.seconds ?? 0) > 180

const tagify = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '')
export const LIST_TYPE_TAGS: Record<ListType, string[]> = {
  'tr-genel': ['müzik', 'top10', 'türkçemüzik', 'listeler'],
  pop: ['pop', 'müzik', 'top10', 'listeler'],
  yabanci: ['music', 'top10', 'charts', 'yabancımüzik'],
  dans: ['dance', 'edm', 'top10', 'müzik'],
  rap: ['rap', 'türkçerap', 'hiphop', 'top10'],
  dj: ['dj', 'edm', 'top10', 'djset'],
  shazam: ['shazam', 'müzik', 'top10', 'trend'],
  spotify: ['spotify', 'müzik', 'top10', 'listeler'],
  radyo: ['radyo', 'müzik', 'top10', 'listeler'],
  'netflix-film': ['netflix', 'film', 'top10', 'neizlesem'],
  'netflix-dizi': ['netflix', 'dizi', 'top10', 'neizlesem'],
  dizi: ['dizi', 'top10', 'neizlesem', 'tv'],
  sinema: ['sinema', 'film', 'gişe', 'top10'],
  ozel: ['top10', 'liste'],
  'tek-telefon': ['teknoloji', 'telefon', 'akıllıtelefon', 'top10'],
  'tek-bilgisayar': ['teknoloji', 'laptop', 'bilgisayar', 'top10'],
  'tek-tv': ['teknoloji', 'televizyon', 'smarttv', 'top10'],
  'tek-urun': ['teknoloji', 'gadget', 'inceleme', 'top5'],
  'tek-ai': ['yapayzeka', 'ai', 'teknoloji', 'top10'],
  'urun-tanitim': ['teknoloji', 'inceleme', 'yeniürün', 'tanıtım'],
  'ai-tanitim': ['yapayzeka', 'ai', 'teknoloji', 'yenilik'],
  'tek-haber': ['teknoloji', 'teknolojihaberleri', 'gündem', 'yenilik'],
  etkinlik: ['etkinlik', 'konser', 'neyapsam', 'hafta sonu'],
}
export function listTags(list: Pick<ListProject, 'listType'> & Partial<Pick<ListProject, 'items'>>): string[] {
  const city = list.listType === 'etkinlik' ? list.items?.find((x) => x.event?.city)?.event?.city : undefined
  const extra = city ? [city, `${city}etkinlik`] : []
  return [...new Set([...extra, ...LIST_TYPE_TAGS[list.listType]].map(tagify).filter(Boolean))]
}

/** Otomatik paylaşım metni: başlık, tarih, 1'den N'e sıralar, yayıncı ve etiketler. */
export function defaultListCaption(list: Pick<ListProject, 'items' | 'listType' | 'introTitle' | 'introSubtitle' | 'publisher'>): string {
  const T = LIST_TYPE_INFO[list.listType]
  if (modeOf(list.listType) === 'etkinlik') {
    const rows = list.items
      .filter((x) => x.title)
      .map((x) => {
        const e = (x as Partial<ListItem>).event
        const when = e ? [e.date, e.time].filter(Boolean).join(' ') : ''
        return `📍 ${x.title}${when ? ` — ${when}` : ''}${e?.venue ? `, ${e.venue}` : ''}`
      })
    const follow = list.publisher.handle ? `Şehrin etkinlikleri için takip et: @${list.publisher.handle}` : ''
    const tags = listTags(list).map((t) => `#${t}`).join(' ')
    return [`🎟️ ${list.introTitle || T.title}`, rows.join('\n'), 'Hangisine gidiyorsunuz? Yorumlara yazın 👇', follow, tags].filter(Boolean).join('\n\n').slice(0, 2200)
  }
  const urun = modeOf(list.listType) === 'urun'
  const head = urun ? `⚡ ${list.introTitle || T.title}${list.introSubtitle ? ` — ${list.introSubtitle}` : ''}` : `${T.category === 'teknoloji' ? '⚡' : '🔥'} ${list.introTitle || T.title} — Top ${list.items.length}${list.introSubtitle ? ` (${list.introSubtitle})` : ''}`
  const rows = list.items
    .map((x, i) => (urun ? `▪️ ${x.title}${x.subtitle ? `: ${x.subtitle}` : ''}` : `${i + 1}. ${x.title}${x.subtitle ? ` – ${x.subtitle}` : ''}${(x as Partial<ListItem>).price ? ` (${(x as Partial<ListItem>).price})` : ''}${x.change === 'new' ? ' 🆕' : x.change === 'up' ? ' ⬆️' : ''}`))
    .filter((r) => r.trim().length > 3)
  const ask = T.category === 'teknoloji' ? (urun ? 'Siz alır mıydınız? Yorumlara yazın 👇' : 'Siz hangisini seçerdiniz? Yorumlara yazın 👇') : T.category === 'sinema' ? 'Sizce bu hafta hangisi izlenmeli? Yorumlara yazın 👇' : 'Sizin bu haftaki favoriniz hangisi? Yorumlara yazın 👇'
  const follow = list.publisher.handle ? `Her hafta yeni liste için takip et: @${list.publisher.handle}` : ''
  const tags = listTags(list).map((t) => `#${t}`).join(' ')
  return [head, rows.join('\n'), ask, follow, tags].filter(Boolean).join('\n\n').slice(0, 2200)
}
export const captionFor = (list: Parameters<typeof defaultListCaption>[0] & Pick<ListProject, 'caption'>): string => list.caption.trim() || defaultListCaption(list)
