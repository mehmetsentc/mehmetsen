import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { StudioSession } from '@/media-studio/session'
import type { AssetChoice, Workspace, WorkspaceText } from '@/media-studio/types'
import { MOCK_SETTINGS } from '@/media-studio/mockData'
import type { DownloadPlan } from './inspect'
import type { AnalysisItem } from '@/media-studio/types'

const CAP_BYTES = 5 * 1024 * 1024 * 1024

export interface StoredAnalysis {
  id: string
  ownerId: string
  item: AnalysisItem
  plan: DownloadPlan
  createdAt: number
}

export interface StoredJob {
  id: string
  ownerId: string
  analysisId: string
  assetKeys: AssetChoice[]
  status: StudioSession['jobs'][number]['status']
  title: string
  source: string
  thumbHue: number
  thumbUrl?: string
  workspaceId: string | null
  stageLabel: string
  mediaLabel?: string
  resultLabel?: string
  errorTitle?: string
  errorDetail?: string
  progress: StudioSession['jobs'][number]['progress']
  sizeBytes: number
  createdAt: number
  attempts?: number
}

export async function saveAnalyses(ownerId: string, rows: StoredAnalysis[]): Promise<void> {
  const db = getAdminFirestore()
  const batch = db.batch()
  for (const row of rows) {
    batch.set(db.collection(Collections.MEDIA_STUDIO_ANALYSES).doc(row.id), row)
  }
  await batch.commit()
  void ownerId
}

export async function listAnalyses(ownerId: string): Promise<StoredAnalysis[]> {
  const snap = await getAdminFirestore()
    .collection(Collections.MEDIA_STUDIO_ANALYSES)
    .where('ownerId', '==', ownerId)
    .limit(20)
    .get()
  return snap.docs.map((doc) => doc.data() as StoredAnalysis).sort((a, b) => b.createdAt - a.createdAt)
}

export async function readAnalysis(ownerId: string, id: string): Promise<StoredAnalysis | null> {
  const snap = await getAdminFirestore().collection(Collections.MEDIA_STUDIO_ANALYSES).doc(id).get()
  if (!snap.exists) return null
  const data = snap.data() as StoredAnalysis
  if (data.ownerId !== ownerId) return null
  return data
}

export async function saveJob(job: StoredJob): Promise<void> {
  await getAdminFirestore().collection(Collections.MEDIA_STUDIO_JOBS).doc(job.id).set(job)
}

export async function readJob(ownerId: string, id: string): Promise<StoredJob | null> {
  const snap = await getAdminFirestore().collection(Collections.MEDIA_STUDIO_JOBS).doc(id).get()
  if (!snap.exists) return null
  const data = snap.data() as StoredJob
  if (data.ownerId !== ownerId) return null
  return data
}

export async function listOwned(ownerId: string): Promise<{ jobs: StoredJob[]; workspaces: Workspace[] }> {
  const db = getAdminFirestore()
  const [jobsSnap, spacesSnap] = await Promise.all([
    db.collection(Collections.MEDIA_STUDIO_JOBS).where('ownerId', '==', ownerId).limit(100).get(),
    db.collection(Collections.MEDIA_STUDIO_WORKSPACES).where('ownerId', '==', ownerId).limit(100).get(),
  ])
  const jobs = jobsSnap.docs.map((doc) => doc.data() as StoredJob).sort((a, b) => b.createdAt - a.createdAt)
  const workspaces = spacesSnap.docs.map((doc) => doc.data() as Workspace & { ownerId: string })
  return { jobs, workspaces }
}

export async function saveWorkspace(ownerId: string, workspace: Workspace, sizeBytes: number): Promise<void> {
  await getAdminFirestore()
    .collection(Collections.MEDIA_STUDIO_WORKSPACES)
    .doc(workspace.id)
    .set({ ...workspace, ownerId, sizeBytes })
}

export async function readWorkspace(ownerId: string, id: string): Promise<(Workspace & { sizeBytes?: number }) | null> {
  const snap = await getAdminFirestore().collection(Collections.MEDIA_STUDIO_WORKSPACES).doc(id).get()
  if (!snap.exists) return null
  const data = snap.data() as Workspace & { ownerId: string; sizeBytes?: number }
  if (data.ownerId !== ownerId) return null
  return data
}

export async function deleteWorkspaceDoc(ownerId: string, id: string): Promise<void> {
  const existing = await readWorkspace(ownerId, id)
  if (!existing) return
  await getAdminFirestore().collection(Collections.MEDIA_STUDIO_WORKSPACES).doc(id).delete()
}

export async function readSettings(ownerId: string): Promise<StudioSession['settings']> {
  const snap = await getAdminFirestore().collection(Collections.MEDIA_STUDIO_SETTINGS).doc(ownerId).get()
  if (!snap.exists) return { ...MOCK_SETTINGS, mock: false }
  return { ...MOCK_SETTINGS, ...(snap.data() as Partial<StudioSession['settings']>), mock: false }
}

export async function writeSettings(ownerId: string, settings: StudioSession['settings']): Promise<void> {
  await getAdminFirestore().collection(Collections.MEDIA_STUDIO_SETTINGS).doc(ownerId).set({ ...settings, mock: false })
}

export function quotaFor(bytes: number): StudioSession['quota'] {
  const ratio = Math.min(1, bytes / CAP_BYTES)
  return {
    usedLabel: formatBytes(bytes),
    capLabel: '5 GB',
    usedRatio: ratio,
  }
}

export async function usedBytes(ownerId: string): Promise<number> {
  const { workspaces } = await listOwned(ownerId)
  return workspaces.reduce((sum, workspace) => sum + (Number((workspace as Workspace & { sizeBytes?: number }).sizeBytes) || 0), 0)
}

export async function uploadStudioFile(path: string, body: Buffer, contentType: string): Promise<string> {
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim()
  const bucket = getAdminStorage().bucket(bucketName)
  const file = bucket.file(path)
  await file.save(body, {
    contentType,
    metadata: { cacheControl: 'public, max-age=31536000' },
    public: true,
  })
  return `https://storage.googleapis.com/${bucket.name}/${path}`
}

export async function downloadStudioFile(path: string): Promise<Buffer> {
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim()
  const [buf] = await getAdminStorage().bucket(bucketName).file(path).download()
  return buf
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function textBlock(title: string, description: string, source: string, url: string): WorkspaceText {
  return {
    title,
    description,
    caption: '',
    tags: '',
    notes: '',
    source,
    originalUrl: url,
  }
}
