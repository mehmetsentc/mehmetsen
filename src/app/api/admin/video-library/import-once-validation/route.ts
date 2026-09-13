/**
 * TEMPORARY VL-P3B one-shot import validation.
 * Admin-authenticated, production-only, max one DOWNLOAD job per call.
 * Not a cron. Not a bulk worker. Remove after proof.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { isR2Configured, getStorage } from '@/lib/storage'
import { videoLibraryActionPermission } from '@/video/library/auth'
import { videoImportStore } from '@/video/importer/store'
import {
  oneShotValidationGate,
  runOneShotImportValidation,
} from '@/video/importer/oneShotValidation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function disabled() {
  return NextResponse.json(
    { error: 'One-shot validation kapalı', code: 'VIDEO_LIBRARY_ONE_SHOT_VALIDATION_DISABLED' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function POST(request: Request) {
  const gate = oneShotValidationGate()
  if (!gate.allowed) return disabled()

  const auth = await verifyCmsToken(request, videoLibraryActionPermission('import'))
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: 'R2 yapılandırılmamış', code: 'R2_NOT_CONFIGURED', r2Configured: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const result = await runOneShotImportValidation({
    store: videoImportStore,
    storage: getStorage(),
    r2Configured: true,
  })

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: Request) {
  const gate = oneShotValidationGate()
  if (!gate.allowed) return disabled()
  const auth = await verifyCmsToken(request, videoLibraryActionPermission('import'))
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
