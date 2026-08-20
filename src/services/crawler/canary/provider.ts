/**
 * Real DeepSeek adapter for Phase 4C single-event canary.
 * Uses official model id `deepseek-v4-flash` (DeepSeek-V4-Flash-0731).
 * Token usage from response.usage: prompt_tokens / completion_tokens.
 */

import {
  DEEPSEEK_API_BASE,
  getDeepSeekApiKey,
  getDeepSeekModel,
} from '@/lib/ai/deepseekClient'
import { parseDeepSeekUsage } from '@/lib/ai/usage/parseUsage'
import { canaryConfig } from './flags'
import type { CanaryProvider, CanaryProviderResult } from './types'

export function createDeepSeekCanaryProvider(): CanaryProvider {
  return {
    async chat(input): Promise<CanaryProviderResult> {
      const model = getDeepSeekModel(input.model)
      const apiKey = getDeepSeekApiKey()
      const maxTokens = canaryConfig().maxOutputTokens
      if (!apiKey) {
        return {
          called: false,
          statusCode: 401,
          errorCode: 'missing_api_key',
          provider: 'deepseek',
          model,
        }
      }

      let res: Response
      try {
        res = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: input.system },
              { role: 'user', content: input.user },
            ],
            temperature: 0.2,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
            thinking: { type: 'disabled' },
          }),
          signal: AbortSignal.timeout(90_000),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          called: true,
          errorCode: /timeout|aborted|AbortError/i.test(message) ? 'timeout' : 'network_error',
          provider: 'deepseek',
          model,
        }
      }

      const rawText = await res.text().catch(() => '')
      let body: {
        choices?: Array<{
          finish_reason?: string | null
          message?: { content?: string | null; reasoning_content?: string | null }
        }>
        usage?: unknown
        error?: { message?: string }
      } = {}
      try {
        body = rawText ? (JSON.parse(rawText) as typeof body) : {}
      } catch {
        body = {}
      }

      const usage = parseDeepSeekUsage(body.usage)
      if (!res.ok) {
        return {
          called: true,
          statusCode: res.status,
          errorCode: `http_${res.status}`,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          provider: 'deepseek',
          model,
        }
      }

      const choice = body.choices?.[0]
      const message = choice?.message
      const finishReason = choice?.finish_reason ?? null
      const truncated = finishReason === 'length'
      let text = message?.content?.trim() || ''
      if (!text && message?.reasoning_content) {
        const reasoning = message.reasoning_content.trim()
        const fence = reasoning.match(/```(?:json)?\s*([\s\S]*?)```/)
        text = fence?.[1]?.trim() || reasoning.match(/\{[\s\S]*\}/)?.[0] || ''
      }

      return {
        called: true,
        statusCode: 200,
        text: text || undefined,
        errorCode: text ? undefined : 'empty_content',
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        finishReason,
        truncated,
        provider: 'deepseek',
        model,
      }
    },
  }
}
