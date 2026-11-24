/**
 * TELAFFUZ SÖZLÜĞÜ — İngilizce bir sözcükle aynı yazılan Türkçe yer adları.
 * Yapay zekâ sesleri (Chirp 3 HD, Gemini) «Batman» ilini İngilizce çizgi roman kahramanı gibi
 * «Betmen» diye okuyabiliyor. Çözüm iki yoldan:
 *   • Google sesleri (Standard / Wavenet / Neural2 / Chirp 3 HD): SSML <phoneme> ile IPA okunuşu.
 *   • Gemini TTS (SSML yok): stil yönergesine açık telaffuz notu.
 * Metnin kendisi değişmez (altyazı / ekran yazısı aynı kalır).
 */

export type Pronunciation = {
  /** yazılış (büyük harfle başlar; Türkçe ekleri «Batman'da», «Batmanlı» da yakalanır) */
  word: string
  /** IPA okunuşu */
  ipa: string
  /** Gemini için açıklama */
  hint: string
}

export const PRONUNCIATIONS: Pronunciation[] = [
  { word: 'Batman', ipa: 'ˈbatman', hint: '«Batman» is a city and province in Turkey: say it the Turkish way, BAHT-mahn (both vowels like the a in "father", stress on the first syllable), never like the English superhero "Betmen"' },
]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** sözcüğün kendisi (eki hariç) — «Batman'da», «Batmanlı», «Batman Petrol» */
function wordRe(word: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])${word}(?=$|[^\\p{L}]|l[ıi]|da|de|ta|te|dan|den|tan|ten|a|e|ın|in|ı|i)`, 'gu')
}

/** metinde sözlükten geçen sözcükler */
export function pronunciationsIn(text: string): Pronunciation[] {
  return PRONUNCIATIONS.filter((p) => wordRe(p.word).test(text))
}

/** Google sesleri için SSML (sözlük sözcüğü yoksa null → düz metin gönderilir). */
export function toPronunciationSsml(text: string): string | null {
  const hits = pronunciationsIn(text)
  if (!hits.length) return null
  // önce bütün metni kaçır, sonra sözcükleri <phoneme> ile sar (sözcüklerde özel karakter yok)
  let s = esc(text)
  for (const p of hits) s = s.replace(wordRe(p.word), `<phoneme alphabet="ipa" ph="${esc(p.ipa)}">${p.word}</phoneme>`)
  return `<speak>${s}</speak>`
}

/** Gemini TTS yönergesine eklenecek not (yoksa boş). */
export function pronunciationPrompt(text: string): string {
  const hits = pronunciationsIn(text)
  return hits.length ? ` Pronunciation: ${hits.map((p) => p.hint).join('; ')}.` : ''
}
