'use client'

import { createContext, useContext } from 'react'
import { mediaStudioWorkspacePath } from '@/media-studio/routes'

export interface StudioLinks {
  workspace: (id: string) => string
  files: (id: string) => string
  href: (path: string) => string
}

const StudioLinkContext = createContext<StudioLinks>({
  workspace: mediaStudioWorkspacePath,
  files: mediaStudioWorkspacePath,
  href: (path) => path,
})

export function StudioLinkProvider({ links, children }: { links: StudioLinks; children: React.ReactNode }) {
  return <StudioLinkContext.Provider value={links}>{children}</StudioLinkContext.Provider>
}

export function useStudioLinks(): StudioLinks {
  return useContext(StudioLinkContext)
}
