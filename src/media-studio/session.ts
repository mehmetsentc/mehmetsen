import { runMockAnalysis, selectedAssetsFor } from './analyze'
import { statusCounts } from './format'
import { filterLibrary } from './libraryQuery'
import { MOCK_JOBS, MOCK_LIBRARY, MOCK_QUOTA, MOCK_SETTINGS, MOCK_WORKSPACES, REVIEW_GALLERY_URL, reviewBatchJobs } from './mockData'
import type {
  AnalysisItem,
  AssetChoice,
  LibraryFilter,
  LibraryItem,
  LibrarySort,
  LibraryView,
  StudioJob,
  StudioQuota,
  StudioSettingsPreview,
  StudioStatus,
  Workspace,
  WorkspaceText,
} from './types'

export interface StudioSession {
  analyses: AnalysisItem[]
  /** Card-level selection. */
  selectedAnalysisIds: string[]
  /** Per analysis card, which available assets are checked. */
  assetSelection: Record<string, AssetChoice[]>
  jobs: StudioJob[]
  library: LibraryItem[]
  libraryQuery: string
  libraryFilter: LibraryFilter
  librarySort: LibrarySort
  libraryView: LibraryView
  workspaces: Workspace[]
  imageSelection: Record<string, string[]>
  notice: string | null
  settings: StudioSettingsPreview
  quota: StudioQuota
}

function safeDisplayName(filename: string): string {
  return filename.trim().replace(/[\\/]/g, '').replace(/\.{2,}/g, '.').replace(/^\.+/, '')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createStudioSession(): StudioSession {
  const workspaces = clone(MOCK_WORKSPACES)
  return {
    analyses: [],
    selectedAnalysisIds: [],
    assetSelection: {},
    jobs: clone(MOCK_JOBS),
    library: clone(MOCK_LIBRARY),
    libraryQuery: '',
    libraryFilter: 'all',
    librarySort: 'newest',
    libraryView: 'grid',
    workspaces,
    imageSelection: {},
    notice: null,
    settings: clone(MOCK_SETTINGS),
    quota: clone(MOCK_QUOTA),
  }
}

export function createEmptyLiveSession(): StudioSession {
  return {
    analyses: [],
    selectedAnalysisIds: [],
    assetSelection: {},
    jobs: [],
    library: [],
    libraryQuery: '',
    libraryFilter: 'all',
    librarySort: 'newest',
    libraryView: 'grid',
    workspaces: [],
    imageSelection: {},
    notice: null,
    settings: clone(MOCK_SETTINGS),
    quota: { usedLabel: '0 GB', capLabel: '5 GB', usedRatio: 0 },
  }
}

export function applyMockAnalysis(session: StudioSession, text: string): StudioSession {
  const run = runMockAnalysis(text)
  const assetSelection: Record<string, AssetChoice[]> = {}
  for (const item of run.items) {
    assetSelection[item.id] = selectedAssetsFor(item)
  }
  return {
    ...session,
    analyses: run.items,
    selectedAnalysisIds: run.selectedIds,
    assetSelection,
    notice: run.empty ? 'Analiz edilecek bağlantı yok.' : null,
  }
}

export function toggleAnalysis(session: StudioSession, id: string): StudioSession {
  const item = session.analyses.find((entry) => entry.id === id)
  if (!item || item.status !== 'READY') return session
  const has = session.selectedAnalysisIds.includes(id)
  return {
    ...session,
    selectedAnalysisIds: has
      ? session.selectedAnalysisIds.filter((entry) => entry !== id)
      : [...session.selectedAnalysisIds, id],
  }
}

export function selectAllReady(session: StudioSession): StudioSession {
  return {
    ...session,
    selectedAnalysisIds: session.analyses.filter((item) => item.status === 'READY').map((item) => item.id),
  }
}

export function clearAnalysisSelection(session: StudioSession): StudioSession {
  return { ...session, selectedAnalysisIds: [] }
}

export function toggleAnalysisAsset(session: StudioSession, id: string, key: AssetChoice): StudioSession {
  const item = session.analyses.find((entry) => entry.id === id)
  if (!item || !item.assets.some((asset) => asset.key === key && asset.available)) return session
  const current = session.assetSelection[id] ?? []
  const next = current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]
  return { ...session, assetSelection: { ...session.assetSelection, [id]: next } }
}

export function enqueueSelected(session: StudioSession): StudioSession {
  const chosen = session.analyses.filter(
    (item) => session.selectedAnalysisIds.includes(item.id) && item.status === 'READY'
  )
  if (chosen.length === 0) {
    return { ...session, notice: 'İndirilecek hazır içerik seçilmedi.' }
  }
  const jobs: StudioJob[] = chosen.map((item, index) => ({
    id: `job_local_${item.id}_${Date.now()}_${index}`,
    title: item.title,
    source: item.source,
    status: 'QUEUED',
    createdLabel: 'Az önce',
    sizeLabel: '—',
    thumbHue: item.thumbHue,
    workspaceId: null,
    progress: null,
    stageLabel: 'Sırada',
    mock: true,
  }))
  return {
    ...session,
    jobs: [...jobs, ...session.jobs],
    selectedAnalysisIds: [],
    notice: `${jobs.length} içerik kuyruğa alındı.`,
  }
}

export type JobFilter = 'ALL' | StudioStatus

export function filterJobs(jobs: StudioJob[], filter: JobFilter): StudioJob[] {
  if (filter === 'ALL') return jobs
  return jobs.filter((job) => job.status === filter)
}

function patchJob(session: StudioSession, id: string, map: (job: StudioJob) => StudioJob): StudioSession {
  return { ...session, jobs: session.jobs.map((job) => (job.id === id ? map(job) : job)) }
}

export function cancelJob(session: StudioSession, id: string): StudioSession {
  return patchJob(session, id, (job) => {
    if (job.status !== 'DOWNLOADING' && job.status !== 'QUEUED' && job.status !== 'PROCESSING') return job
    return { ...job, status: 'CANCELLED', stageLabel: 'İptal edildi', progress: job.progress }
  })
}

export function retryJob(session: StudioSession, id: string): StudioSession {
  return patchJob(session, id, (job) => {
    if (job.status !== 'FAILED' && job.status !== 'CANCELLED') return job
    return {
      ...job,
      status: 'QUEUED',
      stageLabel: 'Sırada',
      errorTitle: undefined,
      errorDetail: undefined,
      progress: null,
    }
  })
}

export function deleteJob(session: StudioSession, id: string): StudioSession {
  return { ...session, jobs: session.jobs.filter((job) => job.id !== id) }
}

export function sessionSummary(session: StudioSession) {
  return {
    ...statusCounts(session.jobs.map((job) => job.status)),
    quota: session.quota ?? MOCK_QUOTA,
  }
}

export function setLibraryControls(
  session: StudioSession,
  patch: Partial<Pick<StudioSession, 'libraryQuery' | 'libraryFilter' | 'librarySort' | 'libraryView'>>
): StudioSession {
  return { ...session, ...patch }
}

export function visibleLibrary(session: StudioSession): LibraryItem[] {
  return filterLibrary(session.library, {
    query: session.libraryQuery,
    filter: session.libraryFilter,
    sort: session.librarySort,
  })
}

export function findWorkspace(session: StudioSession, id: string): Workspace | null {
  return session.workspaces.find((workspace) => workspace.id === id) ?? null
}

function mapWorkspace(session: StudioSession, id: string, map: (workspace: Workspace) => Workspace): StudioSession {
  return {
    ...session,
    workspaces: session.workspaces.map((workspace) => (workspace.id === id ? map(workspace) : workspace)),
  }
}

export function textsDiffer(a: WorkspaceText, b: WorkspaceText): boolean {
  return JSON.stringify(a) !== JSON.stringify(b)
}

export function isWorkspaceDirty(workspace: Workspace): boolean {
  return textsDiffer(workspace.editedText, workspace.savedText)
}

export function patchWorkspaceText(
  session: StudioSession,
  id: string,
  key: keyof WorkspaceText,
  value: string
): StudioSession {
  if (key === 'originalUrl') return session
  return mapWorkspace(session, id, (workspace) => ({
    ...workspace,
    editedText: { ...workspace.editedText, [key]: value },
    title: key === 'title' ? value : workspace.title,
  }))
}

export function saveWorkspaceText(session: StudioSession, id: string): StudioSession {
  return mapWorkspace(session, id, (workspace) => ({
    ...workspace,
    savedText: { ...workspace.editedText },
    title: workspace.editedText.title,
  }))
}

export function keepWorkspace(session: StudioSession, id: string): StudioSession {
  return mapWorkspace(session, id, (workspace) => ({
    ...workspace,
    retention: { mode: 'saved', label: 'Kalıcı olarak saklanıyor' },
  }))
}

export function toggleWorkspaceImage(session: StudioSession, workspaceId: string, imageId: string): StudioSession {
  const current = session.imageSelection[workspaceId] ?? []
  const next = current.includes(imageId) ? current.filter((id) => id !== imageId) : [...current, imageId]
  return { ...session, imageSelection: { ...session.imageSelection, [workspaceId]: next } }
}

export function clearWorkspaceImages(session: StudioSession, workspaceId: string): StudioSession {
  return { ...session, imageSelection: { ...session.imageSelection, [workspaceId]: [] } }
}

export function deleteWorkspaceImage(session: StudioSession, workspaceId: string, imageId: string): StudioSession {
  const selected = (session.imageSelection[workspaceId] ?? []).filter((id) => id !== imageId)
  return {
    ...mapWorkspace(session, workspaceId, (workspace) => {
      const images = workspace.images.filter((image) => image.id !== imageId)
      const coverGone = images.length > 0 && !images.some((image) => image.cover)
      return {
        ...workspace,
        images: images.map((image, index) => ({ ...image, cover: coverGone ? index === 0 : image.cover })),
      }
    }),
    imageSelection: { ...session.imageSelection, [workspaceId]: selected },
  }
}

export function deleteSelectedImages(session: StudioSession, workspaceId: string): StudioSession {
  const selected = new Set(session.imageSelection[workspaceId] ?? [])
  if (selected.size === 0) return session
  return {
    ...mapWorkspace(session, workspaceId, (workspace) => {
      const images = workspace.images.filter((image) => !selected.has(image.id))
      const coverGone = !images.some((image) => image.cover)
      return {
        ...workspace,
        images: images.map((image, index) => ({ ...image, cover: coverGone ? index === 0 : image.cover })),
      }
    }),
    imageSelection: { ...session.imageSelection, [workspaceId]: [] },
  }
}

export function setCoverImage(session: StudioSession, workspaceId: string, imageId: string): StudioSession {
  return mapWorkspace(session, workspaceId, (workspace) => ({
    ...workspace,
    images: workspace.images.map((image) => ({ ...image, cover: image.id === imageId })),
  }))
}

export function renameWorkspaceImage(
  session: StudioSession,
  workspaceId: string,
  imageId: string,
  filename: string
): StudioSession {
  const clean = safeDisplayName(filename)
  if (!clean) return session
  return mapWorkspace(session, workspaceId, (workspace) => ({
    ...workspace,
    images: workspace.images.map((image) => (image.id === imageId ? { ...image, filename: clean } : image)),
  }))
}

export function renameWorkspaceFile(
  session: StudioSession,
  workspaceId: string,
  fileId: string,
  name: string
): StudioSession {
  const clean = safeDisplayName(name)
  if (!clean) return session
  return mapWorkspace(session, workspaceId, (workspace) => ({
    ...workspace,
    files: workspace.files.map((file) => (file.id === fileId ? { ...file, name: clean } : file)),
  }))
}

export function deleteWorkspaceFile(session: StudioSession, workspaceId: string, fileId: string): StudioSession {
  return mapWorkspace(session, workspaceId, (workspace) => ({
    ...workspace,
    files: workspace.files.filter((file) => file.id !== fileId),
  }))
}

export function renameWorkspaceVideo(session: StudioSession, workspaceId: string, filename: string): StudioSession {
  const clean = safeDisplayName(filename)
  if (!clean) return session
  return mapWorkspace(session, workspaceId, (workspace) =>
    workspace.video ? { ...workspace, video: { ...workspace.video, filename: clean } } : workspace
  )
}

export function deleteWorkspaceVideo(session: StudioSession, workspaceId: string): StudioSession {
  return mapWorkspace(session, workspaceId, (workspace) => ({ ...workspace, video: null }))
}

export function previewAction(session: StudioSession, message: string): StudioSession {
  return { ...session, notice: message }
}

export function clearNotice(session: StudioSession): StudioSession {
  return { ...session, notice: null }
}

let current = createStudioSession()
const listeners = new Set<() => void>()

export function getStudioSession(): StudioSession {
  return current
}

export function subscribeStudio(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function replaceStudioSession(next: StudioSession): void {
  current = next
  listeners.forEach((listener) => listener())
}

export function updateStudioSession(map: (session: StudioSession) => StudioSession): void {
  replaceStudioSession(map(current))
}

export function resetStudioSession(): void {
  replaceStudioSession(createStudioSession())
}

/** Fresh mock session for a review URL. Does not touch a server. */
export function sessionForReview(screen: string): StudioSession {
  const session = createStudioSession()
  if (screen === 'analysis') return applyMockAnalysis(session, REVIEW_GALLERY_URL)
  if (screen === 'download') {
    const active = session.jobs.find((job) => job.id === 'job_downloading')
    return { ...session, jobs: active ? [active] : session.jobs.slice(0, 1) }
  }
  if (screen === 'batch') return { ...session, jobs: reviewBatchJobs() }
  if (screen === 'library-list') return { ...session, libraryView: 'list' }
  return session
}
