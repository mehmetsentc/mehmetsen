/**
 * HASSAS-VIDEO — Video Stüdyosu ve «haberden video» için haber etiği kapısı.
 *
 * Reels ve sosyal paylaşım metinleri zaten `sensitiveNews` sözlüğünden geçiyordu; videonun
 * İÇİNDEKİ seslendirme ve ekran yazısı geçmiyordu. Platformlar (Meta, YouTube, TikTok) videodaki
 * konuşmayı ve yazıyı da değerlendirdiği için kural burada da deterministik uygulanır:
 *  - anlatım, başlık, alt satır, etiket, açıklama nötr dil sözlüğünden geçer (yöntem ifadeleri çıkar)
 *  - düzey 2–3 (ölüm, ağır şiddet, intihar, çocuk mağdur, istismar) «ağır haber» kipinde: müzik ve efekt yok, tempo 0,95, «SON DAKİKA» yok
 * Dayanak: DSÖ intihar habercilik rehberi (2023), RTÜK 6112 m.8 ve 13.11.2019 intihar haberi önerileri.
 */
import { neutralizeSocialText, type SensitivityLevel } from '@/lib/social/sensitiveNews'
import type { StoryMusic, StoryScene } from './storyProject'

export type StoryGravity = 'agir' | null

/** Ağır haber sunuşu: müzik ve efekt kapalı, sakin tempo. */
export const GRAVE_DEFAULTS: { music: StoryMusic; sfx: boolean; rate: number } = { music: 'none', sfx: false, rate: 0.95 }

/** Düzey 2 (ölüm, ağır şiddet) ve 3 (intihar, çocuk mağdur, istismar): ağır haber kipi. Video engellenmez. */
export function gravityFor(level: SensitivityLevel): StoryGravity {
  return level >= 2 ? 'agir' : null
}

/** Seslendirme ve ekran yazısı için nötr haber dili (bağlantı ve özel adlara dokunmaz). */
export function safeStoryText(s: string): string {
  return s ? neutralizeSocialText(s) : s
}

const BREAKING_RE = /son\s*dak[iİı]ka/iu

/** Sahnelerin anlatımı, vurguları, başlıkları ve etiketi. Ağır haberde «SON DAKİKA» etiketi «HABER» olur. */
export function safeStoryScenes(scenes: StoryScene[], gravity: StoryGravity): StoryScene[] {
  return scenes.map((sc) => {
    const text = safeStoryText(sc.text)
    const lowered = text.toLocaleLowerCase('tr-TR')
    const highlights = text === sc.text ? sc.highlights : sc.highlights.filter((h) => lowered.includes(h.toLocaleLowerCase('tr-TR')))
    let label = sc.label ? safeStoryText(sc.label) : sc.label
    if (gravity === 'agir' && label && BREAKING_RE.test(label)) label = 'HABER'
    let headline = sc.headline ? safeStoryText(sc.headline) : sc.headline
    if (gravity === 'agir' && headline) headline = headline.replace(/!+/g, '').trim() || null
    const sub = sc.sub ? safeStoryText(sc.sub) : sc.sub
    return { ...sc, text, highlights, label, headline, sub }
  })
}
