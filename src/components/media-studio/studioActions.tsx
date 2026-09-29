'use client'

import { createContext, useContext, useLayoutEffect } from 'react'
import { auth, ensureAuthReady } from '@/lib/firebase/auth'
import {
  applyMockAnalysis,
  cancelJob,
  clearNotice,
  clearWorkspaceImages,
  createEmptyLiveSession,
  deleteJob,
  deleteSelectedImages,
  deleteWorkspaceFile,
  deleteWorkspaceImage,
  deleteWorkspaceVideo,
  enqueueSelected,
  getStudioSession,
  keepWorkspace,
  patchWorkspaceText,
  previewAction,
  renameWorkspaceFile,
  renameWorkspaceImage,
  renameWorkspaceVideo,
  retryJob,
  saveWorkspaceText,
  selectAllReady,
  setCoverImage,
  setLibraryControls,
  toggleAnalysis,
  toggleAnalysisAsset,
  toggleWorkspaceImage,
  updateStudioSession,
} from '@/media-studio/session'
import type { StudioSession } from '@/media-studio/session'
import type { AssetChoice, StudioJob, WorkspaceText } from '@/media-studio/types'

export interface StudioActions {
  analyze(text: string): Promise<void>
  selectAll(): void
  clearAnalyses(): Promise<void>
  toggleAnalysis(id: string): void
  toggleAsset(id: string, key: AssetChoice): void
  enqueue(): Promise<void>
  cancel(id: string): Promise<void>
  retry(id: string): Promise<void>
  deleteJob(id: string): Promise<void>
  openFile(job: StudioJob): void
  setLibrary(patch: Partial<Pick<StudioSession, 'libraryQuery' | 'libraryFilter' | 'librarySort' | 'libraryView'>>): void
  clearNotice(): void
  patchText(id: string, key: keyof WorkspaceText, value: string): void
  saveText(id: string): Promise<void>
  keep(id: string): Promise<void>
  removeWorkspace(id: string): Promise<void>
  zip(id: string): Promise<void>
  downloadAll(id: string): void
  handoff(id: string): Promise<void>
  renameImage(id: string, imageId: string, filename: string): Promise<void>
  cover(id: string, imageId: string): Promise<void>
  deleteImage(id: string, imageId: string): Promise<void>
  deleteImages(id: string): Promise<void>
  renameVideo(id: string, filename: string): Promise<void>
  deleteVideo(id: string): Promise<void>
  renameFile(id: string, fileId: string, name: string): Promise<void>
  deleteFile(id: string, fileId: string): Promise<void>
  saveSettings(settings: StudioSession['settings']): Promise<void>
  toggleImage(id: string, imageId: string): void
  clearImages(id: string): void
}

const mockActions: StudioActions = {
  async analyze(text) {
    await new Promise((resolve) => window.setTimeout(resolve, 420))
    updateStudioSession((current) => applyMockAnalysis(current, text))
  },
  selectAll: () => updateStudioSession(selectAllReady),
  async clearAnalyses() {
    updateStudioSession((current) => ({ ...current, analyses: [], selectedAnalysisIds: [], assetSelection: {} }))
  },
  toggleAnalysis: (id) => updateStudioSession((current) => toggleAnalysis(current, id)),
  toggleAsset: (id, key) => updateStudioSession((current) => toggleAnalysisAsset(current, id, key)),
  async enqueue() {
    updateStudioSession(enqueueSelected)
  },
  async cancel(id) {
    updateStudioSession((current) => cancelJob(current, id))
  },
  async retry(id) {
    updateStudioSession((current) => retryJob(current, id))
  },
  async deleteJob(id) {
    updateStudioSession((current) => deleteJob(current, id))
  },
  openFile() {
    updateStudioSession((current) => previewAction(current, 'Önizleme: dosya henüz oluşturulmadı.'))
  },
  setLibrary: (patch) => updateStudioSession((current) => setLibraryControls(current, patch)),
  clearNotice: () => updateStudioSession(clearNotice),
  patchText: (id, key, value) => updateStudioSession((current) => patchWorkspaceText(current, id, key, value)),
  async saveText(id) {
    updateStudioSession((current) => saveWorkspaceText(current, id))
  },
  async keep(id) {
    updateStudioSession((current) => keepWorkspace(current, id))
  },
  async removeWorkspace() {
    updateStudioSession((current) => previewAction(current, 'Önizleme: çalışma alanı silinmedi.'))
  },
  async zip() {
    updateStudioSession((current) => previewAction(current, 'Önizleme: ZIP henüz oluşturulmadı.'))
  },
  downloadAll() {
    updateStudioSession((current) => previewAction(current, 'Önizleme: dosya henüz oluşturulmadı.'))
  },
  async handoff() {
    updateStudioSession((current) => previewAction(current, 'Önizleme: haber editörüne aktarım bir sonraki fazda açılacak. Yayın yok.'))
  },
  async renameImage(id, imageId, filename) {
    updateStudioSession((current) => renameWorkspaceImage(current, id, imageId, filename))
  },
  async cover(id, imageId) {
    updateStudioSession((current) => setCoverImage(current, id, imageId))
  },
  async deleteImage(id, imageId) {
    updateStudioSession((current) => deleteWorkspaceImage(current, id, imageId))
  },
  async deleteImages(id) {
    updateStudioSession((current) => deleteSelectedImages(current, id))
  },
  async renameVideo(id, filename) {
    updateStudioSession((current) => renameWorkspaceVideo(current, id, filename))
  },
  async deleteVideo(id) {
    updateStudioSession((current) => deleteWorkspaceVideo(current, id))
  },
  async renameFile(id, fileId, name) {
    updateStudioSession((current) => renameWorkspaceFile(current, id, fileId, name))
  },
  async deleteFile(id, fileId) {
    updateStudioSession((current) => deleteWorkspaceFile(current, id, fileId))
  },
  async saveSettings() {
    updateStudioSession((current) => previewAction(current, 'Önizleme. Bu ayarlar henüz kaydedilmez.'))
  },
  toggleImage: (id, imageId) => updateStudioSession((current) => toggleWorkspaceImage(current, id, imageId)),
  clearImages: (id) => updateStudioSession((current) => clearWorkspaceImages(current, id)),
}

const StudioActionsContext = createContext<StudioActions>(mockActions)

export function useStudioActions(): StudioActions {
  return useContext(StudioActionsContext)
}

function sameIds(left: { id: string }[], right: { id: string }[]): boolean {
  return left.map((item) => item.id).join('\n') === right.map((item) => item.id).join('\n')
}

function mergeSnapshot(snapshot: StudioSession): void {
  updateStudioSession((current) => {
    const keepAnalysis = sameIds(current.analyses, snapshot.analyses)
    return {
      ...snapshot,
      libraryQuery: current.libraryQuery,
      libraryFilter: current.libraryFilter,
      librarySort: current.librarySort,
      libraryView: current.libraryView,
      imageSelection: current.imageSelection,
      analyses: keepAnalysis ? current.analyses : snapshot.analyses,
      selectedAnalysisIds: keepAnalysis ? current.selectedAnalysisIds : snapshot.selectedAnalysisIds,
      assetSelection: keepAnalysis ? current.assetSelection : snapshot.assetSelection,
    }
  })
}

async function authToken(): Promise<string | null> {
  await ensureAuthReady()
  return auth.currentUser?.getIdToken() ?? null
}

async function postCommand(body: Record<string, unknown>): Promise<void> {
  const token = await authToken()
  if (!token) throw new Error('Oturum yok.')
  const response = await fetch('/api/admin/media-studio', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as { session?: StudioSession; error?: string }
  if (payload.session) mergeSnapshot(payload.session)
  if (!response.ok) throw new Error(payload.error || 'İşlem tamamlanamadı.')
}

export function StudioLiveBridge({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    replaceWithEmpty()
    let stop = false
    const refresh = async () => {
      const token = await authToken()
      if (!token || stop) return
      const response = await fetch('/api/admin/media-studio', { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) return
      const payload = (await response.json()) as { session?: StudioSession }
      if (payload.session) mergeSnapshot(payload.session)
    }
    void refresh()
    const timer = window.setInterval(() => {
      const session = getStudioSession()
      if (session.jobs.some((job) => job.status === 'DOWNLOADING' || job.status === 'QUEUED' || job.status === 'PROCESSING')) {
        void refresh()
      }
    }, 1500)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [])

  const live: StudioActions = {
    ...mockActions,
    analyze: async (text) => {
      await postCommand({ type: 'analyze', text })
    },
    clearAnalyses: async () => {
      await postCommand({ type: 'clearAnalyses' })
    },
    enqueue: async () => {
      const session = getStudioSession()
      await postCommand({
        type: 'enqueue',
        items: session.selectedAnalysisIds.map((id) => ({ id, assets: session.assetSelection[id] ?? [] })),
      })
      updateStudioSession((current) => ({ ...current, analyses: [], selectedAnalysisIds: [], assetSelection: {} }))
    },
    cancel: async (id) => postCommand({ type: 'cancel', id }),
    retry: async (id) => postCommand({ type: 'retry', id }),
    deleteJob: async (id) => postCommand({ type: 'deleteJob', id }),
    openFile: (job) => {
      const workspace = getStudioSession().workspaces.find((item) => item.id === job.workspaceId)
      const url = workspace?.video?.publicUrl || workspace?.files.find((file) => file.publicUrl)?.publicUrl
      if (url) window.open(url, '_blank', 'noopener')
      else updateStudioSession((current) => ({ ...current, notice: 'İndirilecek dosya yok.' }))
    },
    saveText: async (id) => {
      const workspace = getStudioSession().workspaces.find((item) => item.id === id)
      if (!workspace) return
      await postCommand({ type: 'saveText', id, text: workspace.editedText })
    },
    keep: async (id) => postCommand({ type: 'keep', id }),
    removeWorkspace: async (id) => postCommand({ type: 'deleteWorkspace', id }),
    zip: async (id) => {
      const token = await authToken()
      if (!token) return
      const response = await fetch(`/api/admin/media-studio/workspaces/${id}/zip`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        updateStudioSession((current) => ({ ...current, notice: 'ZIP oluşturulamadı.' }))
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${id}.zip`
      link.click()
      URL.revokeObjectURL(url)
    },
    downloadAll: (id) => {
      const workspace = getStudioSession().workspaces.find((item) => item.id === id)
      const url = workspace?.files.find((file) => file.publicUrl)?.publicUrl
      if (url) window.open(url, '_blank', 'noopener')
    },
    handoff: async (id) => postCommand({ type: 'handoff', id }),
    renameImage: async (id, imageId, filename) => postCommand({ type: 'renameImage', id, imageId, filename }),
    cover: async (id, imageId) => postCommand({ type: 'cover', id, imageId }),
    deleteImage: async (id, imageId) => postCommand({ type: 'deleteImage', id, imageId }),
    deleteImages: async (id) => {
      const ids = getStudioSession().imageSelection[id] ?? []
      await postCommand({ type: 'deleteImages', id, imageIds: ids })
    },
    renameVideo: async (id, filename) => postCommand({ type: 'renameVideo', id, filename }),
    deleteVideo: async (id) => postCommand({ type: 'deleteVideo', id }),
    renameFile: async (id, fileId, name) => postCommand({ type: 'renameFile', id, fileId, name }),
    deleteFile: async (id, fileId) => postCommand({ type: 'deleteFile', id, fileId }),
    saveSettings: async (settings) => postCommand({ type: 'settings', settings }),
  }

  return <StudioActionsContext.Provider value={live}>{children}</StudioActionsContext.Provider>
}

function replaceWithEmpty() {
  const current = getStudioSession()
  if (current.jobs.some((job) => job.mock) || current.workspaces.some((workspace) => workspace.mock)) {
    updateStudioSession(() => createEmptyLiveSession())
  }
}
