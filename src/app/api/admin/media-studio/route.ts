import { after, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import type { AssetChoice, WorkspaceText } from '@/media-studio/types'
import {
  analyzeFor,
  enqueueFor,
  handoffWorkspace,
  mutateWorkspace,
  patchText,
  runQueued,
  saveSettingsFor,
  snapshotFor,
} from '@/media-studio/server/execute'
import { deleteWorkspaceDoc, readJob, saveJob } from '@/media-studio/server/store'
import type { StudioSession } from '@/media-studio/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function auth(request: Request) {
  return verifyCmsToken(request, 'video:read')
}

export async function GET(request: Request) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const session = await snapshotFor(user.uid)
  return NextResponse.json({ session })
}

export async function POST(request: Request) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json()) as { type?: string; [key: string]: unknown }
  try {
    const session = await handle(user.uid, body)
    return NextResponse.json({ session })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'İşlem tamamlanamadı.'
    const session = await snapshotFor(user.uid, message)
    return NextResponse.json({ session, error: message }, { status: 422 })
  }
}

async function handle(ownerId: string, body: { type?: string; [key: string]: unknown }): Promise<StudioSession> {
  switch (body.type) {
    case 'analyze':
      return analyzeFor(ownerId, String(body.text ?? ''))
    case 'enqueue': {
      const items = Array.isArray(body.items) ? (body.items as { id: string; assets: AssetChoice[] }[]) : []
      const jobs = await enqueueFor(ownerId, items)
      after(() => runQueued(ownerId, jobs.map((job) => job.id)))
      return snapshotFor(ownerId, jobs.length ? null : 'İndirilecek hazır içerik seçilmedi.')
    }
    case 'cancel': {
      const job = await readJob(ownerId, String(body.id ?? ''))
      if (job && (job.status === 'DOWNLOADING' || job.status === 'QUEUED')) {
        await saveJob({ ...job, status: 'CANCELLED', stageLabel: 'İptal edildi' })
      }
      return snapshotFor(ownerId)
    }
    case 'retry': {
      const job = await readJob(ownerId, String(body.id ?? ''))
      if (job && (job.status === 'FAILED' || job.status === 'CANCELLED')) {
        await saveJob({ ...job, status: 'QUEUED', stageLabel: 'Sırada', errorTitle: undefined, errorDetail: undefined, progress: null })
        after(() => runQueued(ownerId, [job.id]))
      }
      return snapshotFor(ownerId)
    }
    case 'deleteJob': {
      const job = await readJob(ownerId, String(body.id ?? ''))
      if (job) await getDelete(job.id)
      return snapshotFor(ownerId)
    }
    case 'saveText':
      await patchText(ownerId, String(body.id ?? ''), body.text as WorkspaceText)
      return snapshotFor(ownerId, 'Metin kaydedildi.')
    case 'keep':
      await mutateWorkspace(ownerId, String(body.id ?? ''), (workspace) => ({
        ...workspace,
        retention: { mode: 'saved', label: 'Saklanıyor' },
      }))
      return snapshotFor(ownerId, 'Kayıt saklandı.')
    case 'deleteWorkspace':
      await deleteWorkspaceDoc(ownerId, String(body.id ?? ''))
      return snapshotFor(ownerId, 'Çalışma alanı silindi.')
    case 'renameImage':
      await mutateWorkspace(ownerId, String(body.id ?? ''), (workspace) => ({
        ...workspace,
        images: workspace.images.map((image) =>
          image.id === body.imageId ? { ...image, filename: String(body.filename ?? image.filename) } : image
        ),
      }))
      return snapshotFor(ownerId)
    case 'cover':
      await mutateWorkspace(ownerId, String(body.id ?? ''), (workspace) => ({
        ...workspace,
        images: workspace.images.map((image) => ({ ...image, cover: image.id === body.imageId })),
      }))
      return snapshotFor(ownerId)
    case 'deleteImage':
      await mutateWorkspace(ownerId, String(body.id ?? ''), (workspace) => ({
        ...workspace,
        images: workspace.images.filter((image) => image.id !== body.imageId),
      }))
      return snapshotFor(ownerId)
    case 'deleteImages': {
      const ids = new Set(Array.isArray(body.imageIds) ? body.imageIds.map(String) : [])
      await mutateWorkspace(ownerId, String(body.id ?? ''), (workspace) => ({
        ...workspace,
        images: workspace.images.filter((image) => !ids.has(image.id)),
      }))
      return snapshotFor(ownerId)
    }
    case 'renameVideo':
      await mutateWorkspace(ownerId, String(body.id ?? ''), (workspace) => ({
        ...workspace,
        video: workspace.video ? { ...workspace.video, filename: String(body.filename ?? workspace.video.filename) } : null,
      }))
      return snapshotFor(ownerId)
    case 'deleteVideo':
      await mutateWorkspace(ownerId, String(body.id ?? ''), (workspace) => ({ ...workspace, video: null }))
      return snapshotFor(ownerId)
    case 'renameFile':
      await mutateWorkspace(ownerId, String(body.id ?? ''), (workspace) => ({
        ...workspace,
        files: workspace.files.map((file) => (file.id === body.fileId ? { ...file, name: String(body.name ?? file.name) } : file)),
      }))
      return snapshotFor(ownerId)
    case 'deleteFile':
      await mutateWorkspace(ownerId, String(body.id ?? ''), (workspace) => ({
        ...workspace,
        files: workspace.files.filter((file) => file.id !== body.fileId),
      }))
      return snapshotFor(ownerId)
    case 'settings':
      await saveSettingsFor(ownerId, body.settings as StudioSession['settings'])
      return snapshotFor(ownerId, 'Ayarlar kaydedildi.')
    case 'handoff': {
      const draftId = await handoffWorkspace(ownerId, String(body.id ?? ''))
      return snapshotFor(ownerId, `Taslak oluşturuldu. Yayın yok. (${draftId})`)
    }
    default:
      return snapshotFor(ownerId)
  }
}

async function getDelete(id: string) {
  const { getAdminFirestore } = await import('@/lib/firebase/admin')
  const { Collections } = await import('@/lib/firebase/collections')
  await getAdminFirestore().collection(Collections.MEDIA_STUDIO_JOBS).doc(id).delete()
}
