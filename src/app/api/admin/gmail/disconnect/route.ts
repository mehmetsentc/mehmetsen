/**
 * POST /api/admin/gmail/disconnect
 * Removes stored Gmail tokens from Firestore. Best-effort revokes at Google.
 * Requires: system:settings permission
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { deleteIntegration, getIntegration } from '@/services/gmailService'
import { revokeGoogleToken } from '@/lib/gmail/oauth'
import { decrypt } from '@/lib/gmail/crypto'
import { gmailJsonError } from '@/lib/gmail/http'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await verifyCmsToken(request, 'system:settings')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Best-effort: revoke the refresh token at Google before deleting locally
    const integration = await getIntegration()
    if (integration?.encryptedRefreshToken) {
      try {
        const refreshToken = await decrypt(integration.encryptedRefreshToken)
        await revokeGoogleToken(refreshToken)
      } catch {
        // Non-fatal: local disconnect still proceeds
      }
    }

    await deleteIntegration()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return gmailJsonError(err)
  }
}
