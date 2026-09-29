import { Collections } from '@/lib/firebase/collections'
import { getAdminFirestore } from '@/lib/firebase/admin'
import type { StudioSession } from '@/media-studio/session'
import type { AssetChoice, LibraryItem, StudioJob, Workspace, WorkspaceText } from '@/media-studio/types'
import type { PlanAsset } from './inspect'
import { inspectUrl } from './inspect'
import { parseImportText } from '@/media-studio/urlInput'
import { safeDownload, StudioHttpError } from './http'
import { zipStore } from './zipStore'
import {
  downloadStudioFile,
  formatBytes,
  listOwned,
  quotaFor,
  listAnalyses,
  readAnalysis,
  readJob,
  readSettings,
  readWorkspace,
  saveAnalyses,
  saveJob,
  saveWorkspace,
  textBlock,
  uploadStudioFile,
  usedBytes,
  writeSettings,
  type StoredAnalysis,
  type StoredJob,
} from './store'

export async function snapshotFor(ownerId: string, notice: string | null = null): Promise<StudioSession> {
  const [{ jobs, workspaces }, settings, bytes, analyses] = await Promise.all([
    listOwned(ownerId),
    readSettings(ownerId),
    usedBytes(ownerId),
    listAnalyses(ownerId),
  ])
  const usedAnalysis = new Set(jobs.map((job) => job.analysisId))
  const pending = analyses.filter((row) => !usedAnalysis.has(row.id))
  const library: LibraryItem[] = workspaces.map((workspace) => ({
    id: workspace.id,
    workspaceId: workspace.id,
    title: workspace.title,
    source: workspace.source,
    mediaCount: workspace.images.length + (workspace.video ? 1 : 0),
    sizeBytes: Number((workspace as Workspace & { sizeBytes?: number }).sizeBytes) || 0,
    sizeLabel: workspace.sizeLabel,
    createdLabel: workspace.importedLabel,
    createdAt: workspace.createdAt ?? Date.now(),
    retentionLabel: workspace.retention.label,
    status: workspace.status,
    flags: [
      'imported',
      ...(workspace.video ? (['video'] as const) : []),
      ...(workspace.images.length ? (['images'] as const) : []),
    ],
    thumbHue: workspace.thumbHue,
    mock: false,
  }))
  return {
    analyses: pending.map((row) => row.item),
    selectedAnalysisIds: pending.filter((row) => row.item.status === 'READY').map((row) => row.id),
    assetSelection: Object.fromEntries(
      pending
        .filter((row) => row.item.status === 'READY')
        .map((row) => [row.id, defaultAssets([...new Set(row.plan.assets.map((asset) => asset.key))], settings)])
    ),
    jobs: jobs.map(toStudioJob),
    library,
    libraryQuery: '',
    libraryFilter: 'all',
    librarySort: 'newest',
    libraryView: 'grid',
    workspaces,
    imageSelection: {},
    notice,
    settings,
    quota: quotaFor(bytes),
  }
}

export async function analyzeFor(ownerId: string, text: string): Promise<StudioSession> {
  const draft = parseImportText(text)
  const urls = draft.uniqueUrls.slice(0, 20)
  if (!urls.length) {
    const notice = draft.invalidCount ? 'Geçersiz bağlantı.' : 'Analiz edilecek bağlantı yok.'
    return snapshotFor(ownerId, notice)
  }
  const inspected = await Promise.all(urls.map((url) => inspectUrl(url)))
  const rows: StoredAnalysis[] = inspected.map((entry) => ({
    id: entry.item.id,
    ownerId,
    item: entry.item,
    plan: entry.plan,
    createdAt: Date.now(),
  }))
  await saveAnalyses(ownerId, rows)
  const session = await snapshotFor(ownerId)
  const ready = rows.filter((row) => row.item.status === 'READY')
  return {
    ...session,
    analyses: rows.map((row) => row.item),
    selectedAnalysisIds: ready.map((row) => row.id),
    assetSelection: Object.fromEntries(
      ready.map((row) => [row.id, defaultAssets([...new Set(row.plan.assets.map((asset) => asset.key))], session.settings)])
    ),
  }
}

export async function enqueueFor(
  ownerId: string,
  items: { id: string; assets: AssetChoice[] }[]
): Promise<StoredJob[]> {
  const created: StoredJob[] = []
  for (const item of items) {
    const analysis = await readAnalysis(ownerId, item.id)
    if (!analysis || analysis.item.status !== 'READY') continue
    const keys = item.assets.filter((key) => analysis.plan.assets.some((asset) => asset.key === key))
    if (!keys.length) continue
    const job: StoredJob = {
      id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId,
      analysisId: analysis.id,
      assetKeys: keys,
      status: 'QUEUED',
      title: analysis.plan.title,
      source: analysis.plan.source,
      thumbHue: analysis.plan.thumbHue,
      workspaceId: null,
      stageLabel: 'Sırada',
      progress: null,
      sizeBytes: 0,
      createdAt: Date.now(),
    }
    await saveJob(job)
    created.push(job)
  }
  return created
}

export async function runQueued(ownerId: string, jobIds: string[]): Promise<void> {
  const settings = await readSettings(ownerId)
  const width = Math.max(1, Math.min(3, settings.concurrentDownloads || 1))
  const queue = [...jobIds]
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift()
      if (!id) return
      const job = await readJob(ownerId, id)
      if (!job || job.status === 'CANCELLED') continue
      await runOne(ownerId, job)
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, Math.max(1, jobIds.length)) }, () => worker()))
}

async function runOne(ownerId: string, job: StoredJob): Promise<void> {
  const analysis = await readAnalysis(ownerId, job.analysisId)
  if (!analysis) {
    await fail(job, 'Analiz kaydı yok.')
    return
  }
  const used = await usedBytes(ownerId)
  if (used >= 5 * 1024 * 1024 * 1024) {
    await fail(job, 'Depolama kotası doldu.')
    return
  }
  const settings = await readSettings(ownerId)
  const chosen = analysis.plan.assets.filter((asset) => job.assetKeys.includes(asset.key) && asset.filename !== 'images')
  if (!chosen.length) {
    await fail(job, 'Seçilen parçalar bu bağlantıda yok.')
    return
  }
  const started = Date.now()
  let loaded = 0
  const workspaceId = `ws_${job.id.slice(4)}`
  const files: Workspace['files'] = []
  const images: Workspace['images'] = []
  let video: Workspace['video'] = null
  let description = ''
  let coverUrl: string | undefined
  try {
    await saveJob({ ...job, status: 'DOWNLOADING', stageLabel: 'İndiriliyor' })
    for (const asset of chosen) {
      const fresh = await readJob(ownerId, job.id)
      if (!fresh || fresh.status === 'CANCELLED') return
      if (asset.text) {
        const body = Buffer.from(asset.text, 'utf8')
        const path = `media-studio/${workspaceId}/${asset.filename}`
        const url = await uploadStudioFile(path, body, asset.filename.endsWith('.json') ? 'application/json' : 'text/plain')
        loaded += body.length
        files.push(fileNode(asset.filename, asset.label, body.length, url, path))
        if (asset.key === 'description') description = asset.text
        await touch(job, loaded, null, started, asset.label, coverUrl)
        continue
      }
      if (!asset.url) continue
      let lastTick = 0
      const downloaded = await safeDownload(asset.url, (bytes, total) => {
        const now = Date.now()
        if (now - lastTick < 700) return
        lastTick = now
        void touch(job, loaded + bytes, total, started, asset.label, coverUrl)
      })
      const path = `media-studio/${workspaceId}/${asset.filename}`
      const still = await readJob(ownerId, job.id)
      if (!still || still.status === 'CANCELLED') return
      if (used + loaded + downloaded.body.length > 5 * 1024 * 1024 * 1024) {
        await fail(job, 'Depolama kotası doldu.')
        return
      }
      const url = await uploadStudioFile(path, downloaded.body, downloaded.contentType)
      loaded += downloaded.body.length
      files.push(fileNode(asset.filename, asset.label, downloaded.body.length, url, path))
      if (asset.key === 'video') {
        video = {
          filename: asset.filename,
          resolution: '—',
          duration: analysis.item.durationLabel ?? '—',
          format: downloaded.contentType.includes('webm') ? 'WEBM' : 'MP4',
          sizeLabel: formatBytes(downloaded.body.length),
          publicUrl: url,
        }
      }
      if (asset.key === 'images' || asset.key === 'thumbnail') {
        images.push({
          id: `img_${files.length}`,
          filename: asset.filename,
          width: 0,
          height: 0,
          sizeLabel: formatBytes(downloaded.body.length),
          format: ext(asset.filename).toUpperCase(),
          cover: asset.key === 'thumbnail' || images.length === 0,
          hue: job.thumbHue,
          publicUrl: url,
        })
        if (asset.key === 'thumbnail') coverUrl = url
      }
      await touch(job, loaded, downloaded.total, started, asset.label, coverUrl)
    }
    const text = textBlock(job.title, description, job.source, analysis.plan.url)
    const workspace: Workspace & { sizeBytes: number } = {
      id: workspaceId,
      title: job.title,
      source: job.source,
      originalUrl: analysis.plan.url,
      importedLabel: new Date().toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }),
      sizeLabel: formatBytes(loaded),
      retention: { mode: 'temporary', label: `Geçici · ${settings.temporaryHours} saat` },
      status: 'COMPLETED',
      thumbHue: job.thumbHue,
      video,
      images,
      originalText: text,
      editedText: text,
      savedText: text,
      files,
      mock: false,
      createdAt: Date.now(),
      sizeBytes: loaded,
    }
    const finished = await readJob(ownerId, job.id)
    if (!finished || finished.status === 'CANCELLED') return
    await saveWorkspace(ownerId, workspace, loaded)
    const labels = [
      video ? 'Video' : null,
      images.length ? `${images.length} Görsel` : null,
      description ? 'Açıklama' : null,
    ].filter(Boolean)
    await saveJob({
      ...job,
      status: 'COMPLETED',
      workspaceId,
      stageLabel: 'İndirme tamamlandı',
      resultLabel: labels.join(' · ') || 'Dosya',
      mediaLabel: video ? `Video · ${video.format}` : undefined,
      thumbUrl: coverUrl,
      sizeBytes: loaded,
      progress: {
        percent: 100,
        loadedLabel: formatBytes(loaded),
        totalLabel: formatBytes(loaded),
        speedLabel: '',
        etaLabel: '',
      },
    })
  } catch (error) {
    const message = error instanceof StudioHttpError ? error.message : 'İndirme tamamlanamadı.'
    await fail(job, message)
  }
}

async function touch(
  job: StoredJob,
  loaded: number,
  total: number | null,
  started: number,
  stage: string,
  thumbUrl?: string
) {
  const fresh = await readJob(job.ownerId, job.id)
  if (!fresh || fresh.status === 'CANCELLED') return
  const elapsed = Math.max(0.2, (Date.now() - started) / 1000)
  const speed = loaded / elapsed
  const remaining = total != null && speed > 0 ? Math.max(0, total - loaded) / speed : null
  await saveJob({
    ...fresh,
    status: 'DOWNLOADING',
    stageLabel: stage,
    thumbUrl,
    progress: {
      percent: total ? Math.min(99, Math.round((loaded / total) * 100)) : null,
      loadedLabel: formatBytes(loaded),
      totalLabel: total ? formatBytes(total) : '—',
      speedLabel: `${(speed / (1024 * 1024)).toFixed(1)} MB/s`,
      etaLabel: remaining == null ? '' : formatEta(remaining),
    },
  })
}

function formatEta(seconds: number): string {
  const whole = Math.round(seconds)
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} kaldı`
}

async function fail(job: StoredJob, message: string) {
  const attempts = job.attempts ?? 0
  const settings = await readSettings(job.ownerId)
  if (settings.autoRetry && attempts < 1 && !message.includes('kota')) {
    const next: StoredJob = {
      ...job,
      attempts: attempts + 1,
      status: 'QUEUED',
      stageLabel: 'Yeniden deneniyor',
      errorTitle: undefined,
      errorDetail: undefined,
      progress: null,
    }
    await saveJob(next)
    await runOne(job.ownerId, next)
    return
  }
  await saveJob({
    ...job,
    status: 'FAILED',
    stageLabel: 'Başarısız',
    errorTitle: message,
    errorDetail: message,
    progress: null,
  })
}

export async function mutateWorkspace(
  ownerId: string,
  id: string,
  patch: (workspace: Workspace) => Workspace | null
): Promise<void> {
  const current = await readWorkspace(ownerId, id)
  if (!current) return
  const next = patch(current)
  if (!next) {
    await getAdminFirestore().collection(Collections.MEDIA_STUDIO_WORKSPACES).doc(id).delete()
    return
  }
  await saveWorkspace(ownerId, next, Number(current.sizeBytes) || 0)
}

export async function zipWorkspace(ownerId: string, id: string): Promise<Buffer> {
  const workspace = await readWorkspace(ownerId, id)
  if (!workspace) throw new StudioHttpError('Çalışma alanı yok.')
  const files = []
  for (const file of workspace.files) {
    const path = (file as { storagePath?: string }).storagePath
    if (!path) continue
    files.push({ name: file.name, data: await downloadStudioFile(path) })
  }
  if (!files.length) throw new StudioHttpError('Paketlenecek dosya yok.')
  return zipStore(files)
}

export async function handoffWorkspace(ownerId: string, id: string): Promise<string> {
  const workspace = await readWorkspace(ownerId, id)
  if (!workspace) throw new StudioHttpError('Çalışma alanı yok.')
  const ref = await getAdminFirestore().collection(Collections.NEWS_DRAFTS).add({
    title: workspace.editedText.title || workspace.title,
    content: workspace.editedText.description,
    summary: workspace.editedText.caption,
    sourceType: 'media_studio',
    sourceUrl: workspace.originalUrl,
    draftStatus: 'pending_review',
    createdAt: Date.now(),
    createdBy: ownerId,
    updatedAt: Date.now(),
    mediaStudioWorkspaceId: workspace.id,
  })
  return ref.id
}

export async function saveSettingsFor(ownerId: string, settings: StudioSession['settings']) {
  await writeSettings(ownerId, { ...settings, mock: false })
}

function toStudioJob(job: StoredJob): StudioJob {
  return {
    id: job.id,
    title: job.title,
    source: job.source,
    status: job.status,
    createdLabel: new Date(job.createdAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }),
    sizeLabel: job.sizeBytes ? formatBytes(job.sizeBytes) : '—',
    thumbHue: job.thumbHue,
    thumbUrl: job.thumbUrl,
    workspaceId: job.workspaceId,
    progress: job.progress,
    stageLabel: job.stageLabel,
    mediaLabel: job.mediaLabel,
    resultLabel: job.resultLabel,
    errorTitle: job.errorTitle,
    errorDetail: job.errorDetail,
    mock: false,
  }
}

function fileNode(name: string, type: string, size: number, publicUrl: string, storagePath: string): Workspace['files'][number] {
  return {
    id: `file_${name}`,
    name,
    type,
    sizeLabel: formatBytes(size),
    modifiedLabel: 'şimdi',
    depth: 0,
    publicUrl,
    storagePath,
  }
}

function defaultAssets(keys: AssetChoice[], settings: StudioSession['settings']): AssetChoice[] {
  return keys.filter((key) => {
    if (key === 'video' || key === 'audio' || key === 'subtitle') return settings.includeVideo
    if (key === 'images' || key === 'thumbnail') return settings.includeImages
    if (key === 'metadata' || key === 'description') return settings.includeMetadata
    return true
  })
}

function ext(name: string): string {
  return name.split('.').pop() || 'bin'
}

export async function patchText(ownerId: string, id: string, text: WorkspaceText) {
  await mutateWorkspace(ownerId, id, (workspace) => ({ ...workspace, editedText: text, savedText: text }))
}
