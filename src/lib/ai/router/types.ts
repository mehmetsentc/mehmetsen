export type AiTaskType =
  | 'classification'
  | 'extraction'
  | 'social'
  | 'longform'
  | 'quality_critical'

export type RouterProviderId = 'groq' | 'gemini' | 'openrouter' | 'deepseek'

export type ChatMessage = { role: string; content: string }

export type ProviderAttemptResult = {
  text: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    cacheHitTokens?: number
    cacheMissTokens?: number
  }
  latencyMs: number
  statusCode: number
  model: string
}

export type RunAiInput<T> = {
  agent: string
  operation: string
  promptVersion: string
  taskType: AiTaskType
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  jsonMode?: boolean
  validate?: (raw: string) => T | null
  cohortKey?: string
}

export type RunAiResult<T> = {
  value: T | string | null
  provider: RouterProviderId | null
  fallback: boolean
  fallbackFrom?: RouterProviderId
  fallbackReason?: string
}
