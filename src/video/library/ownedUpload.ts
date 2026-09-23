import { videoLibraryMaxBytes } from '@/video/featureFlag'
import { newVideoLibraryId } from '@/video/domain/ids'
import { buildVideoLibraryMediaKey } from '@/video/storage/keys'
import type { VideoLibraryItem } from '@/video/domain/types'
import type { VideoLibraryRepository } from '@/video/library/types'
import type { VideoImportStore } from '@/video/importer/types'

export const OWNED_UPLOAD_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
])

const MIME_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
}

const HASH_RE = /^[a-f0-9]{64}$/

export const OWNED_UPLOAD_EXPIRES_SECONDS = 900

export function ownedNormalizedUrl(contentHash: string): string {
  return `nahaber-owned://sha256/${contentHash}`
}

export function sanitizeOwnedFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, '').replace(/[^\w.\- ()[\]]+/g, '_').trim()
  return (base || 'video').slice(0, 180)
}

export function extForOwnedMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? 'mp4'
}

export type OwnedUploadInitInput = {
  filename?: string
  mimeType?: string
  fileSizeBytes?: number
  contentHash?: string
  bucket?: unknown
  storageKey?: unknown
  credentials?: unknown
  command?: unknown
  path?: unknown
}

export function parseOwnedUploadInit(input: OwnedUploadInitInput):
  | { ok: true; filename: string; mimeType: string; fileSizeBytes: number; contentHash: string }
  | { ok: false; code: string } {
  if (
    input.bucket != null ||
    input.storageKey != null ||
    input.credentials != null ||
    input.command != null ||
    input.path != null
  ) {
    return { ok: false, code: 'INVALID_UPLOAD_FIELDS' }
  }
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase() : ''
  if (!OWNED_UPLOAD_MIMES.has(mimeType)) return { ok: false, code: 'INVALID_MIME' }
  const fileSizeBytes = Number(input.fileSizeBytes)
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) return { ok: false, code: 'FILE_TOO_LARGE' }
  if (fileSizeBytes > videoLibraryMaxBytes()) return { ok: false, code: 'FILE_TOO_LARGE' }
  const contentHash = typeof input.contentHash === 'string' ? input.contentHash.trim().toLowerCase() : ''
  if (!HASH_RE.test(contentHash)) return { ok: false, code: 'INVALID_HASH' }
  const filename = sanitizeOwnedFilename(typeof input.filename === 'string' ? input.filename : 'video')
  return { ok: true, filename, mimeType, fileSizeBytes, contentHash }
}

export type OwnedUploadInitResult =
  | {
      outcome: 'ALREADY_IMPORTED'
      item: VideoLibraryItem
      storageKey: string
      uploadUrl: null
      expiresIn: null
    }
  | {
      outcome: 'UPLOAD'
      item: VideoLibraryItem
      storageKey: string
      uploadUrl: string
      expiresIn: number
    }

export async function initOwnedUpload(input: {
  parsed: Extract<ReturnType<typeof parseOwnedUploadInit>, { ok: true }>
  createdBy: string
  repository: VideoLibraryRepository
  store: VideoImportStore
  presignPut: (key: string, contentType: string, expiresSeconds: number) => Promise<string>
}): Promise<OwnedUploadInitResult> {
  const { parsed, createdBy, repository, store, presignPut } = input
  const ownedUrl = ownedNormalizedUrl(parsed.contentHash)
  const existing = await repository.findByDedup({
    platform: 'generic',
    platformVideoId: parsed.contentHash,
    normalizedUrl: ownedUrl,
    contentHash: parsed.contentHash,
  })

  if (existing?.originalStorageKey && (existing.status === 'READY' || existing.status === 'PLAYBACK_READY')) {
    return {
      outcome: 'ALREADY_IMPORTED',
      item: existing,
      storageKey: existing.originalStorageKey,
      uploadUrl: null,
      expiresIn: null,
    }
  }

  const id = existing?.id ?? newVideoLibraryId('vli')
  const storageKey = buildVideoLibraryMediaKey({
    itemId: id,
    kind: 'original',
    filename: `original.${extForOwnedMime(parsed.mimeType)}`,
  })

  const item =
    existing ??
    (await repository.insertOwnedUpload({
      id,
      createdBy,
      title: parsed.filename,
      mimeType: parsed.mimeType,
      fileSizeBytes: parsed.fileSizeBytes,
      contentHash: parsed.contentHash,
      originalStorageKey: storageKey,
    }))

  if (item.originalStorageKey !== storageKey) {
    await store.updateItem(item.id, { originalStorageKey: storageKey, updatedAt: new Date() })
  }

  const fresh = (await store.findItemById(item.id)) ?? { ...item, originalStorageKey: storageKey }
  const uploadUrl = await presignPut(storageKey, parsed.mimeType, OWNED_UPLOAD_EXPIRES_SECONDS)
  return {
    outcome: 'UPLOAD',
    item: fresh,
    storageKey,
    uploadUrl,
    expiresIn: OWNED_UPLOAD_EXPIRES_SECONDS,
  }
}

export async function completeOwnedUpload(input: {
  itemId: string
  store: VideoImportStore
  head: (key: string) => Promise<{
    exists: boolean
    contentType: string | null
    contentLength: number | null
  }>
}): Promise<VideoLibraryItem> {
  const item = await input.store.findItemById(input.itemId)
  if (!item) throw new Error('NOT_FOUND')
  const key = item.originalStorageKey
  if (!key || !key.startsWith(`video-library/${item.id}/original/`)) {
    throw new Error('MISSING_ORIGINAL')
  }
  const meta = await input.head(key)
  if (!meta.exists) throw new Error('UPLOAD_INCOMPLETE')
  if (item.fileSizeBytes && meta.contentLength && meta.contentLength !== item.fileSizeBytes) {
    throw new Error('FILE_TOO_LARGE')
  }
  const now = new Date()
  return input.store.updateItem(item.id, {
    status: 'READY',
    rightsStatus: 'OWNED',
    importedAt: now,
    importErrorCode: null,
    importErrorMessage: null,
    updatedAt: now,
  })
}
