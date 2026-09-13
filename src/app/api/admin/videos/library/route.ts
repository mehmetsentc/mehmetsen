import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { hasDatabaseUrl } from '@/db'
import { isVideoLibraryEnabled, isVideoLibraryImportEnabled } from '@/video/featureFlag'
import { inspectVideoUrl } from '@/video/library/inspect'
import { registerVideoUrl } from '@/video/library/register'
import { videoLibraryRepository } from '@/video/library/repository'
import { enqueueDownloadJob } from '@/video/importer/enqueue'
import { videoImportStore } from '@/video/importer/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function flagOff() {
  return NextResponse.json(
    { error: 'Video Library kapalı', code: 'VIDEO_LIBRARY_DISABLED' },
    { status: 404 }
  )
}

function mapError(err: unknown) {
  const message = err instanceof Error ? err.message : 'FAILED'
  if (message === 'INVALID_URL' || message === 'UNSUPPORTED_URL') {
    return NextResponse.json({ error: 'Geçerli bir video URL’si girin', code: message }, { status: 400 })
  }
  if (message === 'NOT_FOUND') {
    return NextResponse.json({ error: 'Kayıt bulunamadı', code: message }, { status: 404 })
  }
  if (message === 'DATABASE_UNAVAILABLE') {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  console.error('[admin/videos/library]', err)
  return NextResponse.json({ error: 'Video Library işlemi başarısız' }, { status: 500 })
}

export async function GET(request: Request) {
  if (!isVideoLibraryEnabled()) return flagOff()
  const auth = await verifyCmsToken(request, 'video:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  const url = new URL(request.url)
  const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1)
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize') ?? 50), 1), 100)

  try {
    const { items, total } = await videoLibraryRepository.list({
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      importEnabled: isVideoLibraryImportEnabled(),
    })
  } catch (err) {
    return mapError(err)
  }
}

export async function POST(request: Request) {
  if (!isVideoLibraryEnabled()) return flagOff()

  let body: { action?: string; url?: string; id?: string }
  try {
    body = (await request.json()) as { action?: string; url?: string; id?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action =
    body.action === 'register' ? 'register' : body.action === 'import' ? 'import' : 'inspect'
  const permission = action === 'inspect' ? 'video:read' : 'video:create'
  const auth = await verifyCmsToken(request, permission)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    if (action === 'inspect') {
      const videoUrl = typeof body.url === 'string' ? body.url : ''
      const result = await inspectVideoUrl(videoUrl, videoLibraryRepository)
      return NextResponse.json({
        metadata: result.metadata,
        existing: result.existing,
        alreadyExists: Boolean(result.existing),
      })
    }

    if (!hasDatabaseUrl()) {
      return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
    }

    if (action === 'import') {
      if (!isVideoLibraryImportEnabled()) {
        return NextResponse.json(
          { error: 'Video import kapalı', code: 'VIDEO_LIBRARY_IMPORT_DISABLED' },
          { status: 404 }
        )
      }
      const id = typeof body.id === 'string' ? body.id : ''
      if (!id) return NextResponse.json({ error: 'id gerekli', code: 'INVALID_ID' }, { status: 400 })
      const result = await enqueueDownloadJob(id, videoImportStore)
      return NextResponse.json({
        outcome: result.outcome,
        job: 'job' in result ? { id: result.job.id, status: result.job.status } : null,
        item: result.item,
      })
    }

    const videoUrl = typeof body.url === 'string' ? body.url : ''
    const result = await registerVideoUrl(videoUrl, auth.uid, videoLibraryRepository)
    return NextResponse.json({
      outcome: result.outcome,
      item: result.item,
      alreadyExists: result.outcome === 'ALREADY_EXISTS',
    })
  } catch (err) {
    return mapError(err)
  }
}
