/** UI contract for Media Studio. PHASE 1 fixtures only — not a live job API. */

export type StudioStatus =
  | 'QUEUED'
  | 'ANALYZING'
  | 'READY'
  | 'DOWNLOADING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'

export type AssetChoice =
  | 'video'
  | 'description'
  | 'images'
  | 'thumbnail'
  | 'metadata'
  | 'subtitle'
  | 'audio'

export interface AssetAvailability {
  key: AssetChoice
  label: string
  available: boolean
  detail?: string
}

export interface AnalysisItem {
  id: string
  url: string
  status: 'ANALYZING' | 'READY' | 'FAILED'
  title: string
  source: string
  durationLabel: string | null
  qualityLabel: string | null
  summary: string[]
  assets: AssetAvailability[]
  errorTitle?: string
  errorDetail?: string
  thumbHue: number
  /** PHASE 1 local fixture. */
  mock: true
}

export interface JobProgress {
  percent: number
  loadedLabel: string
  totalLabel: string
  speedLabel: string
  etaLabel: string
}

export interface StudioJob {
  id: string
  title: string
  source: string
  status: StudioStatus
  createdLabel: string
  sizeLabel: string
  thumbHue: number
  workspaceId: string | null
  progress: JobProgress | null
  stageLabel?: string
  /** Fixture line such as "Video · MP4 · 1080p". Not worker telemetry. */
  mediaLabel?: string
  /** Short asset line on a completed card, for example "Video · 6 Görsel". */
  resultLabel?: string
  errorTitle?: string
  errorDetail?: string
  mock: true
}

export type LibraryFilter =
  | 'all'
  | 'today'
  | 'video'
  | 'images'
  | 'draft'
  | 'imported'
  | 'saved'
  | 'expiring'

export type LibrarySort = 'newest' | 'oldest' | 'size' | 'name'
export type LibraryView = 'grid' | 'list'

export interface LibraryItem {
  id: string
  workspaceId: string
  title: string
  source: string
  mediaCount: number
  sizeBytes: number
  sizeLabel: string
  createdLabel: string
  createdAt: number
  retentionLabel: string
  status: StudioStatus
  flags: Array<'today' | 'video' | 'images' | 'draft' | 'imported' | 'saved' | 'expiring'>
  thumbHue: number
  mock: true
}

export interface StudioImage {
  id: string
  filename: string
  width: number
  height: number
  sizeLabel: string
  format: string
  cover: boolean
  hue: number
}

export interface StudioFileNode {
  id: string
  name: string
  type: string
  sizeLabel: string
  modifiedLabel: string
  depth: number
}

export interface WorkspaceText {
  title: string
  description: string
  caption: string
  tags: string
  notes: string
  source: string
  originalUrl: string
}

export interface WorkspaceVideo {
  filename: string
  resolution: string
  duration: string
  format: string
  sizeLabel: string
}

export interface WorkspaceRetention {
  mode: 'temporary' | 'saved'
  label: string
}

export interface Workspace {
  id: string
  title: string
  source: string
  originalUrl: string
  importedLabel: string
  sizeLabel: string
  retention: WorkspaceRetention
  status: StudioStatus
  thumbHue: number
  video: WorkspaceVideo | null
  images: StudioImage[]
  originalText: WorkspaceText
  editedText: WorkspaceText
  savedText: WorkspaceText
  files: StudioFileNode[]
  mock: true
}

export type WorkspaceTab = 'general' | 'video' | 'images' | 'text' | 'files'

export const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'general', label: 'Genel' },
  { id: 'video', label: 'Video' },
  { id: 'images', label: 'Görseller' },
  { id: 'text', label: 'Metin' },
  { id: 'files', label: 'Dosyalar' },
]

export interface StudioQuota {
  usedLabel: string
  capLabel: string
  usedRatio: number
}

export interface StudioSettingsPreview {
  mock: true
  concurrentDownloads: number
  defaultQuality: string
  temporaryHours: number
  quota: StudioQuota
  includeVideo: boolean
  includeImages: boolean
  includeMetadata: boolean
  autoRetry: boolean
  zipRetentionHours: number
}
