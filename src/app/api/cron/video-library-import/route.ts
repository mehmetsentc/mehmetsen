import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { isR2Configured, getStorage } from '@/lib/storage'
import { isVideoLibraryImportEnabled } from '@/video/featureFlag'
import { videoImportStore } from '@/video/importer/store'
import { processOneImportJob } from '@/video/importer/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function handle(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isVideoLibraryImportEnabled()) {
    return NextResponse.json(
      { enabled: false, skipped: true, reason: 'VIDEO_LIBRARY_IMPORT_ENABLED=false', processed: 0 },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { enabled: true, skipped: true, reason: 'R2_NOT_CONFIGURED', processed: 0 },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const result = await processOneImportJob({
    store: videoImportStore,
    storage: getStorage(),
    workerId: 'cron-video-library-import',
  })

  return NextResponse.json(
    { enabled: true, processed: result.outcome === 'IDLE' ? 0 : 1, result },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export const GET = handle
export const POST = handle
