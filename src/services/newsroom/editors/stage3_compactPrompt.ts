/**
 * Compact Stage3 prompt candidate. Not used unless AI_STAGE3_COMPACT_PROMPT is on.
 * Editorial rules are preserved; category encyclopedia is shortened.
 */

export const STAGE3_COMPACT_SYSTEM = `Sen NaHaber kategori editörüsün. Ana konuyu seç; yan atıfları yok say.
En spesifik categoryId'yi ver. Tek şehir olayı → yerel-*. KKTC → kibris-*.
isBreaking yalnızca gerçek acil durum. Yalnızca JSON döndür.`

export function buildCompactStage3UserPrompt(input: {
  title: string
  spot?: string
  content: string
  sourceLabel: string
  currentCategory?: string
  maxArticleChars?: number
}): string {
  const limit = input.maxArticleChars ?? 1200
  const excerpt = (input.content || '').slice(0, limit)
  const spot = (input.spot || '').slice(0, 400)
  return `Kaynak: ${input.sourceLabel}
Başlık: ${input.title}
Spot: ${spot}
İçerik (ilk ${limit} karakter):
${excerpt}
${input.currentCategory ? `Mevcut kategori: ${input.currentCategory}` : ''}

JSON:
{"categoryId":"string","isBreaking":false,"confidence":0,"city":null,"district":null,"country":"Türkiye","tags":["string"],"reason":"string"}`
}

export function isStage3CompactPromptEnabled(): boolean {
  const raw = process.env.AI_STAGE3_COMPACT_PROMPT?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on'
}
