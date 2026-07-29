/**
 * POST /api/admin/gmail/disconnect
 * Removes stored Gmail tokens from Firestore.
 * Requires: system:settings permission
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { deleteIntegration } from '@/services/gmailService'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await verifyCmsToken(request, 'system:settings')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await deleteIntegration()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[gmail/disconnect]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
