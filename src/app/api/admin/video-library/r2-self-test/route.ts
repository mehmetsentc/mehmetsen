/**
 * POST /api/admin/video-library/r2-self-test
 *
 * Production-runtime R2 validation. Does not enable Video Library.
 * Zero DB writes. Reuses R2StorageProvider only.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasPermission } from '@/types/cms'
import {
  assertSafeDiagnosticJson,
  cleanupR2SelfTest,
  runR2SelfTest,
} from '@/lib/storage/r2SelfTest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function json(body: unknown, status = 200) {
  try {
    assertSafeDiagnosticJson(body)
  } catch {
    return NextResponse.json(
      {
        error: 'Unsafe diagnostic payload blocked',
        configured: false,
        upload: 'FAIL',
        publicGet: 'FAIL',
        rangeStart: 'FAIL',
        rangeMiddle: 'FAIL',
        faststart: 'FAIL',
        cors: 'FAIL',
      },
      { status: 500 },
    )
  }
  return NextResponse.json(body, { status })
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasPermission(auth.role, 'video:edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let action = 'run'
  let validationId: string | undefined
  try {
    const body = (await request.json()) as { action?: unknown; validationId?: unknown }
    if (typeof body.action === 'string') action = body.action.trim().toLowerCase()
    if (typeof body.validationId === 'string') validationId = body.validationId
  } catch {
    action = 'run'
  }

  try {
    if (action === 'cleanup') {
      if (!validationId) {
        return json({ error: 'validationId required', cleanup: 'FAIL' }, 400)
      }
      const result = await cleanupR2SelfTest(validationId)
      return json(result)
    }

    if (action !== 'run') {
      return json({ error: 'Unsupported action' }, 400)
    }

    const result = await runR2SelfTest()
    return json(result)
  } catch (err) {
    const code = err instanceof Error && err.message === 'INVALID_VALIDATION_ID'
      ? 'INVALID_VALIDATION_ID'
      : 'R2_SELF_TEST_FAILED'
    return json(
      {
        error: code,
        configured: true,
        upload: 'FAIL',
        publicGet: 'FAIL',
        rangeStart: 'FAIL',
        rangeMiddle: 'FAIL',
        faststart: 'FAIL',
        cors: 'FAIL',
        cleanup: 'FAIL',
      },
      code === 'INVALID_VALIDATION_ID' ? 400 : 500,
    )
  }
}
