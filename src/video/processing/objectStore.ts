import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import type { StorageUploadOptions } from '@/lib/storage/types'

export type VideoObjectStore = {
  upload(
    key: string,
    body: Buffer | Uint8Array,
    options?: StorageUploadOptions
  ): Promise<{ key: string; url: string }>
  getBytes(key: string): Promise<Uint8Array>
  exists(key: string): Promise<boolean>
  getPublicUrl(key: string): string
  delete?(key: string): Promise<void>
}

function assertSafeKey(key: string): string {
  const trimmed = key.replace(/^\/+/, '')
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\0')) {
    throw new Error('INVALID_STORAGE_KEY')
  }
  return trimmed
}

export function createMemoryVideoObjectStore(): VideoObjectStore & {
  objects: Map<string, { body: Uint8Array; contentType?: string }>
} {
  const objects = new Map<string, { body: Uint8Array; contentType?: string }>()
  return {
    objects,
    async upload(key, body, options) {
      const safe = assertSafeKey(key)
      const buf = body instanceof Buffer ? body : Buffer.from(body)
      objects.set(safe, { body: buf, contentType: options?.contentType })
      return { key: safe, url: `memory://${safe}` }
    },
    async getBytes(key) {
      const hit = objects.get(assertSafeKey(key))
      if (!hit) throw new Error('NOT_FOUND')
      return hit.body
    },
    async exists(key) {
      return objects.has(assertSafeKey(key))
    },
    getPublicUrl(key) {
      return `memory://${assertSafeKey(key)}`
    },
    async delete(key) {
      objects.delete(assertSafeKey(key))
    },
  }
}

export function createLocalVideoObjectStore(rootDir: string): VideoObjectStore {
  const root = resolve(rootDir)

  function pathFor(key: string): string {
    const safe = assertSafeKey(key)
    const full = resolve(join(root, ...safe.split('/')))
    if (full !== root && !full.startsWith(root + sep)) throw new Error('INVALID_STORAGE_KEY')
    return full
  }

  return {
    async upload(key, body, _options) {
      const full = pathFor(key)
      await mkdir(dirname(full), { recursive: true })
      const buf = body instanceof Buffer ? body : Buffer.from(body)
      await writeFile(full, buf)
      return { key: assertSafeKey(key), url: `file://${full}` }
    },
    async getBytes(key) {
      return await readFile(pathFor(key))
    },
    async exists(key) {
      try {
        await readFile(pathFor(key))
        return true
      } catch {
        return false
      }
    },
    getPublicUrl(key) {
      return `file://${pathFor(key)}`
    },
    async delete(key) {
      try {
        await rm(pathFor(key), { force: true })
      } catch {
        // ignore
      }
    },
  }
}

export async function createR2VideoObjectStore(): Promise<VideoObjectStore> {
  const { R2StorageProvider } = await import('@/lib/storage/r2Client')
  const r2 = new R2StorageProvider()
  return {
    upload: (key, body, options) => r2.upload(key, body, options),
    getBytes: (key) => r2.download(key),
    exists: (key) => r2.exists(key),
    getPublicUrl: (key) => r2.getPublicUrl(key),
    delete: (key) => r2.delete(key),
  }
}

export async function createVideoObjectStoreFromEnv(): Promise<VideoObjectStore> {
  const local = process.env.VIDEO_LIBRARY_LOCAL_OBJECT_ROOT?.trim()
  if (local) return createLocalVideoObjectStore(local)
  const { isR2Configured } = await import('@/lib/storage')
  if (!isR2Configured()) throw new Error('R2_NOT_CONFIGURED')
  return createR2VideoObjectStore()
}
