/**
 * Chrome sometimes fails IndexedDB with:
 * "Internal error opening backing store for indexedDB.open."
 *
 * Firebase Auth probes IndexedDB on startup. The IDB error event is not
 * canceled by the SDK, so the browser reports it as an uncaught exception
 * and the CMS surfaces the raw message in a toast. Session restore still
 * falls through to localStorage; this only stops the noise.
 */

const BACKING_STORE_RE =
  /internal error opening backing store for indexeddb\.open/i

const GUARD_FLAG = '__nahaberIdbGuard'

type GuardedWindow = Window & { [GUARD_FLAG]?: boolean }

export function isIndexedDbBackingStoreError(error: unknown): boolean {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : ''
  return BACKING_STORE_RE.test(message)
}

export function installIndexedDbBackingStoreGuard(): void {
  if (typeof window === 'undefined') return
  const guarded = window as GuardedWindow
  if (guarded[GUARD_FLAG]) return
  guarded[GUARD_FLAG] = true

  window.addEventListener(
    'error',
    (event) => {
      if (
        isIndexedDbBackingStoreError(event.error) ||
        isIndexedDbBackingStoreError(event.message)
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    true
  )

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (isIndexedDbBackingStoreError(event.reason)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    true
  )

  if (typeof indexedDB === 'undefined' || typeof IDBFactory === 'undefined') return

  const original = IDBFactory.prototype.open
  IDBFactory.prototype.open = function openGuarded(
    this: IDBFactory,
    ...args: Parameters<IDBFactory['open']>
  ) {
    const request = original.apply(this, args)
    request.addEventListener('error', (event) => {
      if (!isIndexedDbBackingStoreError(request.error)) return
      event.preventDefault()
      event.stopPropagation()
    })
    return request
  }
}
