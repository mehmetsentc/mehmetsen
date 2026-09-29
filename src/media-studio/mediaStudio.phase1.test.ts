import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assetAllowed, runMockAnalysis, selectedAssetsFor } from '@/media-studio/analyze'
import { isMediaStudioEnabled } from '@/media-studio/featureFlag'
import { batchOverview, progressEtaLabel, progressSpeedLabel, stepIndex } from '@/media-studio/format'
import { analysisGridClass, imageGridClass, libraryGridClass, studioCanvasClass } from '@/media-studio/layoutContract'
import { filterLibrary } from '@/media-studio/libraryQuery'
import { MOCK_LIBRARY, SAMPLE_IMPORT_TEXT, reviewBatchJobs } from '@/media-studio/mockData'
import { MEDIA_STUDIO_HREF, insertMediaStudioNav } from '@/media-studio/nav'
import { MEDIA_STUDIO_ROUTES, isStudioNavActive, mediaStudioWorkspacePath } from '@/media-studio/routes'
import {
  applyMockAnalysis,
  cancelJob,
  clearAnalysisSelection,
  createStudioSession,
  deleteJob,
  deleteSelectedImages,
  enqueueSelected,
  filterJobs,
  isWorkspaceDirty,
  keepWorkspace,
  patchWorkspaceText,
  renameWorkspaceImage,
  retryJob,
  saveWorkspaceText,
  selectAllReady,
  setLibraryControls,
  toggleAnalysis,
  toggleAnalysisAsset,
  toggleWorkspaceImage,
  visibleLibrary,
} from '@/media-studio/session'
import { WORKSPACE_TABS } from '@/media-studio/types'
import { DEFAULT_CMS_FEATURE_FLAGS } from '@/types/newsroomOs'
import { parseImportText } from '@/media-studio/urlInput'

const FLAG_KEYS = ['MEDIA_STUDIO_ENABLED', 'NEXT_PUBLIC_MEDIA_STUDIO_ENABLED'] as const

describe('media studio phase 1', () => {
  const prev: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of FLAG_KEYS) {
      prev[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of FLAG_KEYS) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
  })

  it('keeps the feature flag off by default and hides the nav item', () => {
    expect(DEFAULT_CMS_FEATURE_FLAGS.mediaStudioEnabled).toBe(false)
    expect(isMediaStudioEnabled()).toBe(false)
    const items = insertMediaStudioNav(
      [{ href: '/admin/videos' }, { href: '/admin/events' }],
      null
    )
    expect(items.map((item) => item.href)).toEqual(['/admin/videos', '/admin/events'])
  })

  it('turns the flag on from env and inserts the sidebar link after videos', () => {
    process.env.MEDIA_STUDIO_ENABLED = 'true'
    expect(isMediaStudioEnabled()).toBe(true)
    const items = insertMediaStudioNav(
      [{ href: '/admin/videos', label: 'Medya Kütüphanesi' }, { href: '/admin/events' }],
      { href: MEDIA_STUDIO_HREF, label: 'Medya Stüdyosu' }
    )
    expect(items.map((item) => item.href)).toEqual(['/admin/videos', MEDIA_STUDIO_HREF, '/admin/events'])
  })

  it('lists the studio routes and workspace path', () => {
    expect(MEDIA_STUDIO_ROUTES).toEqual([
      '/admin/media-studio',
      '/admin/media-studio/jobs',
      '/admin/media-studio/library',
      '/admin/media-studio/failed',
      '/admin/media-studio/settings',
    ])
    expect(mediaStudioWorkspacePath('ws_troya')).toBe('/admin/media-studio/workspaces/ws_troya')
    expect(isStudioNavActive('/admin/media-studio', '/admin/media-studio', true)).toBe(true)
    expect(isStudioNavActive('/admin/media-studio/jobs', '/admin/media-studio', true)).toBe(false)
    expect(isStudioNavActive('/admin/media-studio/jobs', '/admin/media-studio/jobs', false)).toBe(true)
  })

  it('counts urls, duplicates, and invalid lines without fetching', () => {
    const draft = parseImportText(
      ['https://example.com/a', 'https://example.com/a/', 'not a url', 'https://example.com/b'].join('\n')
    )
    expect(draft.urlCount).toBe(3)
    expect(draft.duplicateCount).toBe(1)
    expect(draft.invalidCount).toBe(1)
    expect(draft.uniqueUrls).toEqual(['https://example.com/a', 'https://example.com/b'])
  })

  it('builds the six mock analysis states and default asset selection', () => {
    const run = runMockAnalysis(SAMPLE_IMPORT_TEXT)
    expect(run.items.map((item) => item.status)).toEqual(['READY', 'READY', 'READY', 'READY', 'FAILED', 'ANALYZING'])
    const gallery = run.items[0]
    expect(gallery.summary).toContain('6 Görsel')
    expect(selectedAssetsFor(gallery)).toContain('video')
    expect(selectedAssetsFor(gallery)).not.toContain('subtitle')
    expect(assetAllowed(gallery, 'audio')).toBe(false)
    expect(assetAllowed(run.items[3], 'metadata')).toBe(true)
    expect(assetAllowed(run.items[3], 'video')).toBe(false)
    expect(run.items[4].errorTitle).toBe('Video kaynağı analiz edilemedi.')
  })

  it('selects cards, clears them, and enqueues only ready items', () => {
    let session = applyMockAnalysis(createStudioSession(), SAMPLE_IMPORT_TEXT)
    expect(session.selectedAnalysisIds).toHaveLength(4)
    session = clearAnalysisSelection(session)
    expect(session.selectedAnalysisIds).toEqual([])
    session = selectAllReady(session)
    const failed = session.analyses.find((item) => item.status === 'FAILED')
    expect(failed && session.selectedAnalysisIds.includes(failed.id)).toBe(false)
    session = toggleAnalysis(session, session.analyses[0].id)
    const before = session.jobs.length
    const queued = enqueueSelected(session)
    expect(queued.jobs.length).toBe(before + 3)
    expect(queued.jobs.filter((job) => job.status === 'FAILED').length).toBe(
      session.jobs.filter((job) => job.status === 'FAILED').length
    )
    expect(queued.selectedAnalysisIds).toEqual([])
  })

  it('toggles an available asset and ignores a disabled one', () => {
    let session = applyMockAnalysis(createStudioSession(), SAMPLE_IMPORT_TEXT)
    const id = session.analyses[0].id
    session = toggleAnalysisAsset(session, id, 'subtitle')
    expect(session.assetSelection[id]).toContain('subtitle')
    const meta = session.analyses[3].id
    const before = session.assetSelection[meta]
    session = toggleAnalysisAsset(session, meta, 'video')
    expect(session.assetSelection[meta]).toEqual(before)
  })

  it('filters jobs and retries or cancels one job without resetting the queue', () => {
    const session = createStudioSession()
    expect(filterJobs(session.jobs, 'FAILED').length).toBe(2)
    expect(filterJobs(session.jobs, 'DOWNLOADING')[0].progress?.percent).toBe(68)
    const failedId = session.jobs.find((job) => job.status === 'FAILED')!.id
    const otherId = session.jobs.find((job) => job.status === 'QUEUED')!.id
    const retried = retryJob(session, failedId)
    expect(retried.jobs.find((job) => job.id === failedId)?.status).toBe('QUEUED')
    expect(retried.jobs.find((job) => job.id === otherId)?.status).toBe('QUEUED')
    const activeId = session.jobs.find((job) => job.status === 'DOWNLOADING')!.id
    const cancelled = cancelJob(session, activeId)
    expect(cancelled.jobs.find((job) => job.id === activeId)?.status).toBe('CANCELLED')
    expect(cancelled.jobs.find((job) => job.id === otherId)?.status).toBe('QUEUED')
    expect(deleteJob(cancelled, activeId).jobs.some((job) => job.id === activeId)).toBe(false)
  })

  it('filters and sorts the library for grid and list data', () => {
    let session = createStudioSession()
    expect(visibleLibrary(session)).toHaveLength(MOCK_LIBRARY.length)
    session = setLibraryControls(session, { libraryFilter: 'video', librarySort: 'size', libraryView: 'list' })
    const videos = visibleLibrary(session)
    expect(videos.every((item) => item.flags.includes('video'))).toBe(true)
    expect(videos[0].sizeBytes).toBeGreaterThanOrEqual(videos[videos.length - 1].sizeBytes)
    session = setLibraryControls(session, { libraryQuery: 'yok-boyle-bir-kayit', libraryFilter: 'all', libraryView: 'grid' })
    expect(visibleLibrary(session)).toEqual([])
    expect(filterLibrary(MOCK_LIBRARY, { query: '', filter: 'imported', sort: 'name' })[0].title).toContain('NaHaber')
  })

  it('edits metadata, tracks unsaved text, and keeps the original url', () => {
    const session = createStudioSession()
    const id = 'ws_troya'
    expect(WORKSPACE_TABS.map((tab) => tab.id)).toEqual(['general', 'video', 'images', 'text', 'files'])
    const dirty = patchWorkspaceText(session, id, 'description', 'Düzenlenmiş açıklama')
    const workspace = dirty.workspaces.find((item) => item.id === id)!
    expect(isWorkspaceDirty(workspace)).toBe(true)
    expect(workspace.originalText.description).not.toBe('Düzenlenmiş açıklama')
    const blocked = patchWorkspaceText(dirty, id, 'originalUrl', 'https://evil.example')
    expect(blocked.workspaces.find((item) => item.id === id)?.editedText.originalUrl).toBe(workspace.originalText.originalUrl)
    const saved = saveWorkspaceText(dirty, id)
    expect(isWorkspaceDirty(saved.workspaces.find((item) => item.id === id)!)).toBe(false)
  })

  it('selects images, renames without path traversal, and steps the lightbox', () => {
    let session = createStudioSession()
    session = toggleWorkspaceImage(session, 'ws_troya', 'troya_1')
    session = toggleWorkspaceImage(session, 'ws_troya', 'troya_2')
    expect(session.imageSelection.ws_troya).toEqual(['troya_1', 'troya_2'])
    session = renameWorkspaceImage(session, 'ws_troya', 'troya_1', '../../secret.jpg')
    const renamed = session.workspaces.find((item) => item.id === 'ws_troya')?.images[0].filename
    expect(renamed).toBe('secret.jpg')
    const removed = deleteSelectedImages(session, 'ws_troya')
    const names = removed.workspaces.find((item) => item.id === 'ws_troya')?.images.map((image) => image.id)
    expect(names).not.toContain('troya_1')
    expect(names).not.toContain('troya_2')
    expect(stepIndex(0, 6, -1)).toBe(5)
    expect(stepIndex(5, 6, 1)).toBe(0)
  })

  it('builds a 20-item review batch at 35 percent', () => {
    const jobs = reviewBatchJobs()
    expect(jobs).toHaveLength(20)
    expect(batchOverview(jobs)).toMatchObject({ total: 20, completed: 7, active: 3, queued: 10, failed: 0, percent: 35 })
    expect(progressSpeedLabel('8.4 MB/s')).toBe('8.4 MB/sn')
    expect(progressEtaLabel('00:07 kaldı')).toBe('yaklaşık 7 sn kaldı')
  })

  it('switches retention to saved and keeps the canvas full width', () => {
    const saved = keepWorkspace(createStudioSession(), 'ws_troya')
    expect(saved.workspaces.find((item) => item.id === 'ws_troya')?.retention).toEqual({
      mode: 'saved',
      label: 'Kalıcı olarak saklanıyor',
    })
    const classes = [studioCanvasClass, analysisGridClass, libraryGridClass, imageGridClass].join(' ')
    expect(classes).toContain('xl:grid-cols-3')
    expect(classes).toContain('grid-cols-2')
    expect(classes).not.toContain('max-w-3xl')
    expect(classes).not.toContain('max-w-4xl')
  })
})
