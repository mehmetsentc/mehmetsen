/**
 * POST /api/social/accounts/[id]/check — «Bağlantıyı kontrol et».
 * One read-only platform call with the account's own stored token; nothing is
 * published. A rejected token (Meta 190/102) turns the account to
 * `needs_reauth`. Account managers only; tokens never leave the server.
 */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json } from '@/lib/social/accounts/connect/routeHelpers'
import { loadSocialAccount } from '@/lib/social/accounts/accountStore'
import { canManageAccount } from '@/lib/social/accounts/access'
import { checkAccountConnection } from '@/lib/social/accounts/connectionCheck'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const TEXT: Record<string, string> = {
  ok: 'Bağlantı çalışıyor — platform erişim anahtarını kabul etti.',
  token_rejected: 'Platform erişim anahtarını reddetti. Hesap «yeniden bağlantı gerekli» durumunda; «Platform girişiyle yeniden bağla» ile yenileyin.',
  legacy: 'Eski (legacy) bağlantı bu panelden kontrol edilemez.',
  no_secret: 'Bu hesap için kayıtlı erişim anahtarı yok; yeniden bağlayın.',
  network: 'Platforma ulaşılamadı; daha sonra tekrar deneyin.',
  platform_error: 'Platform beklenmeyen bir hata döndürdü; bağlantı durumu değiştirilmedi.',
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const loaded = await loadSocialAccount(id)
  if (loaded.state !== 'ok' || !canManageAccount(auth.actor, loaded.account.ownership)) return json({ error: 'not_found', code: 'not_found' }, 404)
  const r = await checkAccountConnection(id, { by: auth.actor.uid, now: Date.now() })
  if (r.state === 'ok') return json({ state: 'ok', message: TEXT.ok })
  if (r.state === 'token_rejected') return json({ state: 'token_rejected', metaCode: r.code, metaSubcode: r.subcode, message: TEXT.token_rejected })
  return json({ state: 'unavailable', reason: r.reason, ...(r.httpStatus ? { httpStatus: r.httpStatus } : {}), message: TEXT[r.reason] })
}
