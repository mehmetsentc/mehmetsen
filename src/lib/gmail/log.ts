/**
 * Safe Gmail diagnostics — never log tokens, secrets, or auth codes.
 */
const SECRETISH = /access_token|refresh_token|client_secret|authorization.?code|id_token/i

export function gmailLog(
  event:
    | 'gmail.connect.started'
    | 'gmail.connect.completed'
    | 'gmail.connect.failed'
    | 'gmail.token.refresh.success'
    | 'gmail.token.refresh.failed'
    | 'gmail.messages.fetch.success'
    | 'gmail.messages.fetch.failed'
    | 'gmail.disconnect',
  meta?: Record<string, unknown>,
): void {
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta ?? {})) {
    if (SECRETISH.test(k)) continue
    if (typeof v === 'string' && /ya29\.|1\/\/|GOCSPX-/.test(v)) continue
    safe[k] = v
  }
  console.info(`[gmail] ${event}`, safe)
}
