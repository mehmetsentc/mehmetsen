import { sanitizeReturnPath } from '@/lib/auth/returnTo'

export type AuthIntentAction = 'FOLLOW' | 'LIKE' | 'SAVE' | 'COMMENT'

export type AuthIntentTargetType = 'publisher' | 'article'

export interface AuthIntent {
  action: AuthIntentAction
  targetType: AuthIntentTargetType
  targetId: string
  returnUrl: string
}

const STORAGE_KEY = 'nahaber_auth_intent'

export function buildAuthIntent(
  action: AuthIntentAction,
  targetType: AuthIntentTargetType,
  targetId: string,
  returnUrl: string
): AuthIntent | null {
  const safeReturn = sanitizeReturnPath(returnUrl)
  const id = targetId?.trim()
  if (!safeReturn || !id) return null
  return { action, targetType, targetId: id, returnUrl: safeReturn }
}

export function rememberAuthIntent(intent: AuthIntent): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent))
  } catch {
    /* ignore */
  }
}

export function peekAuthIntent(): AuthIntent | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthIntent>
    if (
      !parsed.action ||
      !parsed.targetType ||
      !parsed.targetId ||
      !parsed.returnUrl
    ) {
      return null
    }
    const safeReturn = sanitizeReturnPath(parsed.returnUrl)
    if (!safeReturn) return null
    if (!['FOLLOW', 'LIKE', 'SAVE', 'COMMENT'].includes(parsed.action)) return null
    if (!['publisher', 'article'].includes(parsed.targetType)) return null
    return {
      action: parsed.action as AuthIntentAction,
      targetType: parsed.targetType as AuthIntentTargetType,
      targetId: String(parsed.targetId),
      returnUrl: safeReturn,
    }
  } catch {
    return null
  }
}

export function consumeAuthIntent(): AuthIntent | null {
  const intent = peekAuthIntent()
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
  return intent
}

export function loginHrefWithIntent(intent: AuthIntent): string {
  rememberAuthIntent(intent)
  return `/login?next=${encodeURIComponent(intent.returnUrl)}`
}
