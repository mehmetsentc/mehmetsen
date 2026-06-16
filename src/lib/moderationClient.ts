/**
 * Client-side helper for the `/api/moderate` route.
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

export async function moderate(
  input: {
    text?: string
    mediaUrls?: ModerationMedia[]
    idToken: string
  }
): Promise<ModerationResult> {
  try {
    const res = await fetch('/api/moderate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.idToken}`,
      },
      body: JSON.stringify({ text: input.text, mediaUrls: input.mediaUrls }),
    })

    if (!res.ok) {
      return { decision: 'review', reasons: [`error:http-${res.status}`] }
    }

    const data = (await res.json()) as ModerationResult
    if (data.decision !== 'approve' && data.decision !== 'review') {
      return { decision: 'review', reasons: ['error:bad-response'] }
    }
    return data
  } catch {
    return { decision: 'review', reasons: ['error:network'] }
  }
}
