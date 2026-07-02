/**
 * chiefEditor — SHIM
 *
 * Sistem artık sadece DeepSeek kullanıyor.
 * Bu dosya geriye dönük uyumluluk için tüm çağrıları deepseek.ts'e yönlendiriyor.
 * GEMINI_API_KEY (google_search) artık kullanılmıyor.
 */

export type { ChiefEditorResult, ChiefEditorInput } from './deepseek'

export {
  deepseekQaCheck as runChiefEditor,
  isDeepSeekConfigured as isChiefEditorConfigured,
} from './deepseek'

import { checkDeepSeekHealth } from './deepseek'

export async function checkChiefEditorHealth() {
  const result = await checkDeepSeekHealth()
  return {
    ok: result.ok,
    latencyMs: result.latencyMs,
    model: result.model,
    webSearchEnabled: false,   // DeepSeek web araması desteklemiyor
    error: result.error,
  }
}
