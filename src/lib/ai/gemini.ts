/**
 * Gemini — SHIM
 *
 * Sistem artık sadece DeepSeek kullanıyor.
 * Bu dosya geriye dönük uyumluluk için tüm çağrıları deepseek.ts'e yönlendiriyor.
 * GEMINI_API_KEY artık kullanılmıyor.
 */

export type { GeminiEditInput } from './deepseek'
export type { GeminiEditResult } from './types'

export {
  deepseekEditArticle as geminiEditArticle,
  isDeepSeekConfigured as isGeminiConfigured,
  checkDeepSeekHealth as checkGeminiHealth,
} from './deepseek'
