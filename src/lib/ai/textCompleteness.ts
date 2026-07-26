/**
 * AI haber metni tamlık kontrolleri — yarım cümle / kesilmiş kelime tespiti.
 */

const TRAILING_CONJUNCTIONS =
  /(?:^|\s)(ve|veya|ile|için|olan|olarak|ama|fakat|ancak|çünkü|ki|de|da|bir|bu|şu|o|gibi|kadar|sonra|önce|üzere|göre)\s*$/iu

const LEADING_FRAGMENT =
  /^(?:\.{2,3}|…|,|;|:|ve|veya|ile|için|olan|ama|fakat|ancak|ki|de|da)\b/iu

/** Cümle/başlık yarım mı? (CMS AI önizlemesindeki “yabanc”, “gerçek…” kesikleri) */
export function textLooksIncomplete(text: string, opts?: { allowShortHeading?: boolean }): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return true

  if (LEADING_FRAGMENT.test(t)) return true
  if (TRAILING_CONJUNCTIONS.test(t)) return true

  const endsWithCloser = /[.!?…:;"»')\]]$/.test(t)
  const lastWord = t.split(/\s+/).pop() ?? ''

  // Ortadan kesilmiş kelime: noktalama yok + son “kelime” doğal bitmemiş gibi
  if (!endsWithCloser) {
    if (opts?.allowShortHeading && t.split(/\s+/).length <= 6 && t.length <= 55) {
      // Kısa H2/H3 etiketleri noktasız olabilir
      return TRAILING_CONJUNCTIONS.test(t) || LEADING_FRAGMENT.test(t)
    }
    if (t.length > 35) return true
    // Çok kısa ama bağlaçla biten / eksik görünen
    if (lastWord.length >= 5 && /[a-zçğıöşü]$/iu.test(lastWord)) return true
  }

  return false
}

/** Başlık olarak kullanılabilecek kısa etiket üret; uzun caption’ı ASLA keserek başlık yapma. */
export function shortHeadingFromCaption(
  caption: string | undefined,
  title: string,
  fallback: string
): string {
  const raw = (caption || '').trim()
  // Uzun görsel açıklaması başlık OLAMAZ — manşetten kısa etiket türet
  if (!raw || raw.split(/\s+/).length > 8 || raw.length > 60) {
    const fromTitle = title
      .replace(/[«»""]/g, '')
      .split(/[:\-–—|]/)[0]
      ?.trim()
      .split(/\s+/)
      .slice(0, 5)
      .join(' ')
    return (fromTitle && fromTitle.length >= 8 ? fromTitle : fallback).slice(0, 55)
  }
  return raw
    .replace(/^(fotoğraf|görsel|image)\s*[:\-–—]?\s*/i, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(' ')
}

export function contentHasIncompleteSegments(content: string): boolean {
  const chunks = content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean)

  for (const chunk of chunks) {
    if (/^#{1,4}\s+/.test(chunk)) {
      const heading = chunk.replace(/^#{1,4}\s+/, '').split('\n')[0]?.trim() ?? ''
      if (textLooksIncomplete(heading, { allowShortHeading: true })) return true
      const body = chunk.split('\n').slice(1).join(' ').trim()
      if (body && textLooksIncomplete(body)) return true
      continue
    }
    if (textLooksIncomplete(chunk)) return true
  }
  return false
}
