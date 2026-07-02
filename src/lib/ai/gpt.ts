/**
 * GPT — SHIM
 *
 * Sistem artık sadece DeepSeek kullanıyor.
 * Bu dosya geriye dönük uyumluluk için tüm çağrıları deepseek.ts'e yönlendiriyor.
 * OPENAI_API_KEY artık kullanılmıyor.
 */

export type { GptQaResult } from './types'

export {
  isDeepSeekConfigured as isGptConfigured,
  checkDeepSeekHealth as checkGptHealth,
} from './deepseek'

// gptQaCheck → deepseekQaCheck (ChiefEditorInput uyumlu, GptQaResult şeklinde döndür)
import { deepseekQaCheck, deepseekQaFallback } from './deepseek'
import type { GeminiEditResult, GptQaResult } from './types'

export async function gptQaCheck(article: GeminiEditResult): Promise<GptQaResult> {
  const chief = await deepseekQaCheck(article)
  return {
    decision: chief.decision === 'needs_revision' ? 'needs_revision' : chief.decision,
    score: chief.overallScore,
    grammarScore: 75,
    readabilityScore: 75,
    seoScore: article.seoScore,
    accuracyScore: chief.contentQuality,
    mobileScore: 75,
    googleNewsScore: 75,
    googleDiscoverScore: 75,
    issues: chief.issues,
    suggestions: [],
    revisedTitle: chief.finalTitle !== article.title ? chief.finalTitle : undefined,
    revisedDescription: chief.finalDescription !== (article.content || article.description)
      ? chief.finalDescription
      : undefined,
    pushTitle: chief.pushTitle,
    pushBody: chief.pushBody,
    processedAt: chief.processedAt,
    modelUsed: chief.modelUsed,
  }
}

// gptQaFallback — hala basit math tabanlı, API çağrısı yok
export function gptQaFallback(article: GeminiEditResult): GptQaResult {
  const chief = deepseekQaFallback(article)
  return {
    decision: chief.decision,
    score: chief.overallScore,
    grammarScore: 70,
    readabilityScore: 70,
    seoScore: article.seoScore,
    accuracyScore: article.factCheckScore,
    mobileScore: 75,
    googleNewsScore: article.seoScore,
    googleDiscoverScore: article.seoScore,
    issues: [],
    suggestions: [],
    pushTitle: chief.pushTitle,
    pushBody: chief.pushBody,
    processedAt: Date.now(),
    modelUsed: 'fallback',
  }
}
