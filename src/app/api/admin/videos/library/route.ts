import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { hasDatabaseUrl } from '@/db'
import { isVideoLibraryEnabled, isVideoLibraryImportEnabled, isVideoLibraryProcessEnabled } from '@/video/featureFlag'
import { inspectVideoUrl } from '@/video/library/inspect'
import { inspectBulkVideoUrls } from '@/video/library/inspectBulk'
import { registerVideoUrl } from '@/video/library/register'
import { enqueueSelectedVideoUrls } from '@/video/library/enqueueSelected'
import { parseVideoLibraryAction, videoLibraryActionPermission } from '@/video/library/auth'
import { videoLibraryRepository } from '@/video/library/repository'
import { enqueueDownloadJob } from '@/video/importer/enqueue'
import { enqueueProcessJob } from '@/video/processing/enqueue'
import { videoImportStore } from '@/video/importer/store'
import { resolveImportSource } from '@/video/importer/resolveSource'
import { isR2Configured, getStorage } from '@/lib/storage'

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
  if (message === 'ZERO_SELECTION') {
    return NextResponse.json({ error: 'Seçim yok', code: message }, { status: 400 })
  }
  if (message === 'NOT_FOUND') {
    return NextResponse.json({ error: 'Kayıt bulunamadı', code: message }, { status: 404 })
  }
  if (message === 'MISSING_ORIGINAL') {
    return NextResponse.json({ error: 'Orijinal dosya yok', code: message }, { status: 400 })
  }
  if (message === 'DATABASE_UNAVAILABLE') {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  console.error('[admin/videos/library]', err)
  return NextResponse.json({ error: 'Video Library işlemi başarısız' }, { status: 500 })
}

function libraryAssetUrls(item: { posterStorageKey: string | null; playbackStorageKey: string | null }) {
  if (!isR2Configured()) return { posterPublicUrl: null, playbackPublicUrl: null }
  try {
    const storage = getStorage()
    return {
      posterPublicUrl: item.posterStorageKey ? storage.getPublicUrl(item.posterStorageKey) : null,
      playbackPublicUrl: item.playbackStorageKey ? storage.getPublicUrl(item.playbackStorageKey) : null,
    }
  } catch {
    return { posterPublicUrl: null, playbackPublicUrl: null }
  }
}

function jobView(job: {
  id: string
  itemId: string
  kind: string
  status: string
  attempts: number
  lastError: string | null
  errorCode: string | null
  payload: Record<string, unknown>
  claimedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  const finished = job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELLED'
  return {
    id: job.id,
    itemId: job.itemId,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    errorCode: job.errorCode,
    lastError: job.lastError,
    sourceUrl: typeof job.payload.sourceUrl === 'string' ? job.payload.sourceUrl : null,
    createdAt: job.createdAt,
    startedAt: job.claimedAt,
    finishedAt: finished ? job.updatedAt : null,
  }
}

export async function GET(request: Request) {
  if (!isVideoLibraryEnabled()) return flagOff()
  const url = new URL(request.url)
  const view = url.searchParams.get('view') === 'jobs' ? 'jobs' : 'list'
  const auth = await verifyCmsToken(request, videoLibraryActionPermission(view))
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  try {
    if (view === 'jobs') {
      const jobs = await videoImportStore.listJobs(100)
      const items = await Promise.all(jobs.map((job) => videoImportStore.findItemById(job.itemId)))
      return NextResponse.json({
        jobs: jobs.map((job, i) => ({
          ...jobView(job),
          title: items[i]?.title ?? null,
          platform: items[i]?.platform ?? null,
          originalUrl: items[i]?.originalUrl ?? null,
        })),
        importEnabled: isVideoLibraryImportEnabled(),
      })
    }

    const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1)
    const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize') ?? 50), 1), 100)
    const { items, total } = await videoLibraryRepository.list({
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
    return NextResponse.json({
      items: items.map((item) => ({ ...item, ...libraryAssetUrls(item) })),
      total,
      page,
      pageSize,
      importEnabled: isVideoLibraryImportEnabled(),
      processEnabled: isVideoLibraryProcessEnabled(),
    })
  } catch (err) {
    return mapError(err)
  }
}

export async function POST(request: Request) {
  if (!isVideoLibraryEnabled()) return flagOff()

  let body: { action?: string; url?: string; urls?: string[]; text?: string; id?: string }
  try {
    body = (await request.json()) as {
      action?: string
      url?: string
      urls?: string[]
      text?: string
      id?: string
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = parseVideoLibraryAction(body.action)
  const auth = await verifyCmsToken(request, videoLibraryActionPermission(action))
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    if (action === 'inspect') {
      const videoUrl = typeof body.url === 'string' ? body.url : ''
      const result = await inspectVideoUrl(videoUrl, videoLibraryRepository)
      const source = resolveImportSource({
        platform: result.metadata.platform,
        originalUrl: result.metadata.originalUrl,
        normalizedUrl: result.metadata.normalizedUrl,
      })
      return NextResponse.json({
        metadata: result.metadata,
        existing: result.existing,
        alreadyExists: Boolean(result.existing),
        downloadable: source.ok,
        downloadCode: source.ok ? null : source.code,
        downloadMessage: source.ok ? null : source.message,
      })
    }

    if (action === 'inspect-bulk') {
      const text = typeof body.text === 'string' ? body.text : ''
      const result = await inspectBulkVideoUrls(text, videoLibraryRepository)
      return NextResponse.json(result)
    }

    if (!hasDatabaseUrl()) {
      return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
    }

    if (action === 'import-selected') {
      if (!isVideoLibraryImportEnabled()) {
        return NextResponse.json(
          { error: 'Video import kapalı', code: 'VIDEO_LIBRARY_IMPORT_DISABLED' },
          { status: 404 }
        )
      }
      const urls = Array.isArray(body.urls) ? body.urls.filter((u) => typeof u === 'string') : []
      const result = await enqueueSelectedVideoUrls(
        urls,
        auth.uid,
        videoLibraryRepository,
        videoImportStore
      )
      return NextResponse.json(result)
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

    if (action === 'process') {
      if (!isVideoLibraryProcessEnabled()) {
        return NextResponse.json(
          { error: 'Video işleme kapalı', code: 'VIDEO_LIBRARY_PROCESS_DISABLED' },
          { status: 404 }
        )
      }
      const id = typeof body.id === 'string' ? body.id : ''
      if (!id) return NextResponse.json({ error: 'id gerekli', code: 'INVALID_ID' }, { status: 400 })
      const result = await enqueueProcessJob(id, videoImportStore)
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
