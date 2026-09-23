import type { CmsPermission } from '@/types/cms'

export type VideoLibraryAction =
  | 'inspect'
  | 'inspect-bulk'
  | 'list'
  | 'jobs'
  | 'register'
  | 'import'
  | 'import-selected'
  | 'import-direct-now'
  | 'upload-init'
  | 'upload-complete'
  | 'process'

export function videoLibraryActionPermission(action: VideoLibraryAction): CmsPermission {
  if (action === 'inspect' || action === 'inspect-bulk' || action === 'list' || action === 'jobs') {
    return 'video:read'
  }
  return 'video:create'
}

export function parseVideoLibraryAction(raw: string | undefined): VideoLibraryAction {
  switch (raw) {
    case 'register':
    case 'import':
    case 'import-selected':
    case 'import-direct-now':
    case 'upload-init':
    case 'upload-complete':
    case 'process':
    case 'inspect-bulk':
      return raw
    default:
      return 'inspect'
  }
}
