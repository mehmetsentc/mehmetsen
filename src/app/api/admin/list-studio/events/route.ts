/**
 * ETKİNLİK VİDEO STÜDYOSU
 *   GET  /api/admin/list-studio/events            → videonun hazırlanacağı hesaplar (kullanıcının yetkili olduğu, etkin, yeni bağlantılı)
 *   POST /api/admin/list-studio/events { eventIds[], accountId, introTitle?, title?, aspect?, wmText?, wmPos?, watermark? }
 *        → seçilen etkinliklerden tek video projesi (Liste Stüdyosu altyapısı, studio 'etkinlik')
 * Yalnız sosyal hesap yöneticileri; il yöneticisi yalnız kendi il hesaplarını görür (listManualTargetAccounts).
 * Hiçbir şey paylaşılmaz: paylaşım stüdyoda «Paylaş» ile, ayrıca yapılır.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { actorFromCms } from '@/lib/social/accounts/actor'
import { listManualTargetAccounts } from '@/lib/social/accounts/manualTargets'
import { SHARE_PLATFORMS } from '@/lib/listStudio/listModel'
import { createEventList } from '@/lib/listStudio/eventVideo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const PLATFORMS = new Set<string>(SHARE_PLATFORMS)

async function accounts(ctx: Parameters<typeof actorFromCms>[1] & { uid: string }) {
  const all = await listManualTargetAccounts(actorFromCms(ctx.uid, ctx))
  return all
    .filter((a) => PLATFORMS.has(a.platform) && a.status === 'active' && a.connectionMethod !== 'legacy')
    .map((a) => ({ accountId: a.id, platform: a.platform, displayName: a.displayName, username: a.username ?? null, citySlug: a.ownership?.citySlug ?? null }))
    .sort((x, y) => x.displayName.localeCompare(y.displayName, 'tr'))
}

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json({ accounts: await accounts(auth.ctx) })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const acc = (await accounts(auth.ctx)).find((a) => a.accountId === body.accountId)
  if (!acc) return json({ error: 'Önce videonun hazırlanacağı hesabı seçin (yetkili olduğunuz etkin bir hesap)', code: 'account_required' }, 409)
  const r = await createEventList(auth.ctx.uid, body, { id: acc.accountId, displayName: acc.displayName, username: acc.username }, Date.now())
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json({ list: r.value }, 201)
}
