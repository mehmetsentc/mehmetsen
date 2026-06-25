import { BREAKING_NEWS_SOURCE_IDS, MAX_AI_CALLS_PER_EDITOR } from '@/services/newsroom/config'
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

const URGENCY_KEYWORDS = [
  'son dakika',
  'flaş',
  'flash',
  'breaking',
  'acil',
  'deprem',
  'patlama',
  'çatışma',
  'catisma',
  'ölüm',
  'olum',
  'can kaybı',
  'can kaybi',
  'saldırı',
  'saldiri',
  'yangın',
  'yangin',
] as const

const SPOR_SIGNAL_KEYWORDS = [
  'maç',
  'mac',
  'gol',
  'lig',
  'transfer',
  'fifa',
  'uefa',
  'derbi',
  'futbol',
  'basketbol',
] as const

/**
 * Bu içerikler ne kadar yeni/acil görünürse görünsün son-dakika olamaz.
 * Kutlama, tören, şenlik, anma gibi planlı sosyal etkinlikler.
 */
const NON_BREAKING_KEYWORDS = [
  // Kutlama / bayram
  'kutlama',
  'kutlandı',
  'kutluyor',
  'kutladı',
  'kutlayacak',
  'babalar günü',
  'anneler günü',
  'sevgililer günü',
  'öğretmenler günü',
  'öğretmenlerin günü',
  'çocuk bayramı',
  'gençlik bayramı',
  'zafer bayramı kutl',
  'cumhuriyet bayramı kutl',
  // Tören / etkinlik
  'anma töreni',
  'anma etkinliği',
  'anıldı',
  'anıldı',
  'muharrem',
  'aşure',
  'mezuniyet töreni',
  'açılış töreni',
  'şenlik başladı',
  'şenlik düzenlendi',
  'festival başladı',
  'tören düzenlendi',
  'resepsiyon düzenlendi',
  'sergi açıldı',
  'sergi açılışı',
  'kariyer günü',
  'özel gün',
  // Kurumsal / konferans
  'temsil etti',
  'genel kurulunda',
  'konferansa katıldı',
  'konferansa iştirak',
  'ödül töreni',
  'ödüllendirild',
  'ödül aldı',
  // Yerel olaylar — breaking değil
  'şarampole',
  'trafik kazası',
  // Trend / piyasa araştırması
  'içerik üreticisi ekonomisi',
  'milyar dolara yaklaşacak',
  'pazar büyüklüğü',
  'araştırma şirketi',
] as const

export interface BreakingSignals {
  isBreaking: boolean
  priorityScore: number
}

function textHasSportsSignals(text: string): boolean {
  const lower = text.toLocaleLowerCase('tr-TR')
  return SPOR_SIGNAL_KEYWORDS.some((kw) => lower.includes(kw))
}

/** Score RSS headline/summary for son-dakika urgency before AI rewrite. */
export function analyzeBreakingSignals(
  title: string,
  summary: string,
  sourcePublishedAt?: number | null
): BreakingSignals {
  const text = `${title} ${summary}`.toLocaleLowerCase('tr-TR')
  let score = 45

  for (const kw of URGENCY_KEYWORDS) {
    if (text.includes(kw)) score += 14
  }

  if (sourcePublishedAt) {
    const ageMin = (Date.now() - sourcePublishedAt) / 60_000
    if (ageMin < 15) score += 25
    else if (ageMin < 45) score += 15
    else if (ageMin < 120) score += 8
  }

  const priorityScore = Math.min(100, Math.max(1, score))
  const hasUrgencyKeyword = URGENCY_KEYWORDS.some((kw) => text.includes(kw))
  // Kutlama/tören/şenlik gibi planlı sosyal etkinlikler son-dakika olamaz.
  // "son dakika" kaynağından gelen Babalar Günü vs. içerikleri filtrele.
  const hasCelebrationContent = NON_BREAKING_KEYWORDS.some((kw) => text.includes(kw))

  // Yerel haber sinyalleri — "son dakika" prefix'i olsa bile breaking değil.
  // Aggregatör siteler (sondakika.com, haberler.com) yerel haberleri "Son Dakika:"
  // prefix'iyle yayınlıyor. Bu bayrakla blokluyoruz.
  const LOCAL_BLOCKING_TERMS = [
    'belediye başkanı', 'belediye baskani',
    'asfalt serim', 'asfalt çalışma', 'yol onarım', 'kaldırım',
    'mahalle.*inceledi', 'ilçede.*inceledi', 'beldede.*inceledi',
    'açılışını yaptı', 'açılışına katıldı', 'etkinliğine katıldı',
    'hırsız', 'uyuşturucu operasyon', 'narkotik operasyon',
    'zabıta', 'muhtarlık',
  ] as const
  const hasLocalBlockingTerm = LOCAL_BLOCKING_TERMS.some((kw) =>
    kw.includes('.*') ? new RegExp(kw).test(text) : text.includes(kw)
  )

  // Eşik 55→80: sadece zaman yeterliliği (70 puan) artık son-dakikayı tetiklemiyor.
  // Gerçek son-dakika = acil kelime İÇERMELİ veya çok yüksek skor (acil kw + tazelik).
  const isBreaking =
    !textHasSportsSignals(text) &&
    !hasCelebrationContent &&
    !hasLocalBlockingTerm &&
    (priorityScore >= 80 || hasUrgencyKeyword)

  return { isBreaking, priorityScore }
}

/** Son dakika editörü — CNN, BBC, Reuters, TRT, NTV, Habertürk. */
export const breakingNewsEditor = {
  sourceIds: BREAKING_NEWS_SOURCE_IDS,

  async run(maxAiCalls = MAX_AI_CALLS_PER_EDITOR): Promise<NewsroomRunResult> {
    return runRssEditor({
      sourceIds: BREAKING_NEWS_SOURCE_IDS,
      editorId: 'breaking-news',
      editorType: 'breaking',
      maxAiCalls,
      enrichInput: (item) => {
        const signals = analyzeBreakingSignals(item.title, item.summary, item.publishedAt)
        return {
          priorityScore: signals.priorityScore,
          isBreaking: signals.isBreaking,
        }
      },
    })
  },
}
