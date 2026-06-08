/**
 * Client-side helper for the `/api/moderate` route.
 *
 * This is deliberately separate from `src/services/moderationService.ts` (which
 * is server-only and reads secret env vars) so the secret-bearing logic and the
 * keyword list are never bundled into client code.
 */

export type ModerationDecision = 'approve' | 'review'

export interface ModerationMedia {
  url: string
  type: 'image' | 'video'
}

export interface ModerationResult {
  decision: ModerationDecision
  reasons?: string[]
  scores?: Record<string, number>
}

export async function moderate(input: {
  text?: string
  mediaUrls?: ModerationMedia[]
}): Promise<ModerationResult> {
  try {
    const res = await fetch('/api/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })

    if (!res.ok) {
      // Fail closed: if the moderation endpoint is unhappy, hold for review.
      return { decision: 'review', reasons: [`error:http-${res.status}`] }
    }

    const data = (await res.json()) as ModerationResult
    if (data.decision !== 'approve' && data.decision !== 'review') {
      return { decision: 'review', reasons: ['error:bad-response'] }
    }
    return data
  } catch {
    // Network/parse failure → safer to review than to publish unchecked.
    return { decision: 'review', reasons: ['error:network'] }
  }
}
