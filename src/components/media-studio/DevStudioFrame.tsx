'use client'

import { useState } from 'react'
import '@/styles/tokens/admin.css'
import { replaceStudioSession, sessionForReview } from '@/media-studio/session'
import { REVIEW_GALLERY_URL } from '@/media-studio/mockData'
import { FailedScreen } from './FailedScreen'
import { ImportScreen } from './ImportScreen'
import { JobsScreen } from './JobsScreen'
import { LibraryScreen } from './LibraryScreen'
import { MediaStudioShell } from './MediaStudioShell'
import { SettingsScreen } from './SettingsScreen'
import { StudioLinkProvider } from './studioLinks'
import { WorkspaceScreen } from './WorkspaceScreen'

const previewLinks = {
  workspace: () => '/dev/media-studio?screen=workspace',
  files: () => '/dev/media-studio?screen=files',
  href: (path: string) => {
    if (path.startsWith('/admin/media-studio/jobs')) return '/dev/media-studio?screen=jobs'
    if (path.startsWith('/admin/media-studio/library')) return '/dev/media-studio?screen=library'
    if (path.startsWith('/admin/media-studio/failed')) return '/dev/media-studio?screen=failed'
    if (path.startsWith('/admin/media-studio/settings')) return '/dev/media-studio?screen=settings'
    if (path.includes('/workspaces/')) return '/dev/media-studio?screen=workspace'
    return '/dev/media-studio?screen=import'
  },
}

export function DevStudioFrame({ screen }: { screen: string }) {
  const [active, setActive] = useState(() => {
    replaceStudioSession(sessionForReview(screen))
    return screen
  })
  if (active !== screen) {
    setActive(screen)
    replaceStudioSession(sessionForReview(screen))
  }

  return (
    <StudioLinkProvider links={previewLinks}>
      <div className="admin-shell h-screen min-w-0 overflow-y-auto bg-[rgb(var(--color-bg))]">
        <MediaStudioShell navPathname={previewPath(screen)}>
          <div key={screen}>{frameScreen(screen)}</div>
        </MediaStudioShell>
      </div>
    </StudioLinkProvider>
  )
}

function previewPath(screen: string): string {
  if (screen === 'jobs' || screen === 'download' || screen === 'batch') return '/admin/media-studio/jobs'
  if (screen === 'library' || screen === 'library-list') return '/admin/media-studio/library'
  if (screen === 'failed') return '/admin/media-studio/failed'
  if (screen === 'settings') return '/admin/media-studio/settings'
  if (screen === 'workspace' || screen === 'images' || screen === 'metadata' || screen === 'video' || screen === 'files') {
    return '/admin/media-studio/workspaces/ws_troya'
  }
  return '/admin/media-studio'
}

function frameScreen(screen: string) {
  if (screen === 'jobs') return <JobsScreen />
  if (screen === 'download') return <JobsScreen immediate />
  if (screen === 'batch') return <JobsScreen immediate />
  if (screen === 'library' || screen === 'library-list') return <LibraryScreen />
  if (screen === 'failed') return <FailedScreen />
  if (screen === 'settings') return <SettingsScreen />
  if (screen === 'workspace') return <WorkspaceScreen id="ws_troya" />
  if (screen === 'images') return <WorkspaceScreen id="ws_troya" initialTab="images" />
  if (screen === 'metadata') return <WorkspaceScreen id="ws_troya" initialTab="text" />
  if (screen === 'video') return <WorkspaceScreen id="ws_troya" initialTab="video" />
  if (screen === 'files') return <WorkspaceScreen id="ws_troya" initialTab="files" />
  if (screen === 'analysis') return <ImportScreen mode="result" initialText={REVIEW_GALLERY_URL} />
  return <ImportScreen />
}
