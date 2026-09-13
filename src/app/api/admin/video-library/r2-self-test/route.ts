/**
 * POST /api/admin/video-library/r2-self-test
 *
 * Temporary production-runtime R2 validation. Disabled by default.
 * Does not enable Video Library. Zero DB writes. Reuses R2StorageProvider only.
 *
 * Locks:
 * - admin auth + video:edit
 * - R2_SELF_TEST_ENABLED must be "1" or "true"
 * - explicit action "run" | "cleanup" | "cors-inspect" | "cors-apply"
 * - secret presence (value/length/prefix/suffix/hash/mask) never returned
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasPermission } from '@/types/cms'
import { isR2Configured } from '@/lib/storage'
import {
  applyPlaybackCors,
  assertSafeDiagnosticJson,
  cleanupR2SelfTest,
  inspectR2Cors,
  isR2SelfTestEnabled,
  runR2SelfTest,
} from '@/lib/storage/r2SelfTest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_ACTIONS = new Set(['run', 'cleanup', 'cors-inspect', 'cors-apply'])

function presence() {
  return {
    configured: isR2Configured(),
    enabled: isR2SelfTestEnabled(),
  }
}

function json(body: unknown, status = 200) {
  try {
    assertSafeDiagnosticJson(body)
  } catch {
    return NextResponse.json(
      {
        error: 'Unsafe diagnostic payload blocked',
        configured: false,
        enabled: false,
        upload: 'FAIL',
        publicGet: 'FAIL',
        rangeStart: 'FAIL',
        rangeMiddle: 'FAIL',
        faststart: 'FAIL',
        cors: 'FAIL',
        go: false,
      },
      { status: 500 },
    )
  }
  return NextResponse.json(body, { status })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasPermission(auth.role, 'video:edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isR2SelfTestEnabled()) {
    return json(
      {
        error: 'R2_SELF_TEST_DISABLED',
        ...presence(),
        go: false,
      },
      403,
    )
  }

  let action: string | null = null
  let validationId: string | undefined
  try {
    const body = (await request.json()) as { action?: unknown; validationId?: unknown }
    if (typeof body.action === 'string' && body.action.trim()) {
      action = body.action.trim().toLowerCase()
    }
    if (typeof body.validationId === 'string') validationId = body.validationId
  } catch {
    return json(
      {
        error: 'ACTION_REQUIRED',
        ...presence(),
        go: false,
      },
      400,
    )
  }

  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return json(
      {
        error: 'ACTION_REQUIRED',
        ...presence(),
        go: false,
      },
      400,
    )
  }

  try {
    if (action === 'cleanup') {
      if (!validationId) {
        return json({ error: 'validationId required', cleanup: 'FAIL', go: false, ...presence() }, 400)
      }
      const result = await cleanupR2SelfTest(validationId)
      return json(result)
    }

    if (action === 'cors-inspect') {
      return json(await inspectR2Cors())
    }

    if (action === 'cors-apply') {
      return json(await applyPlaybackCors())
    }

    if (action !== 'run') {
      return json({ error: 'ACTION_REQUIRED', ...presence(), go: false }, 400)
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
        ...presence(),
        upload: 'FAIL',
        publicGet: 'FAIL',
        rangeStart: 'FAIL',
        rangeMiddle: 'FAIL',
        faststart: 'FAIL',
        cors: 'FAIL',
        cleanup: 'FAIL',
        go: false,
      },
      code === 'INVALID_VALIDATION_ID' ? 400 : 500,
    )
  }
}
