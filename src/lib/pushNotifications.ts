/**
 * Web Push Notification client utilities.
 * Handles subscription, permission, and notification display.
 */

const SW_PATH = '/sw.js'
const PUSH_SUBSCRIBE_URL = '/api/push/subscribe'
const PUSH_UNSUBSCRIBE_URL = '/api/push/unsubscribe'

export type PushPermission = 'granted' | 'denied' | 'default' | 'unsupported'

/** True when the browser supports Web Push. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

/** Current push permission state. */
export function getPushPermission(): PushPermission {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission as PushPermission
}

/** Register service worker and return the registration. */
async function getSwRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(SW_PATH, { scope: '/' })
}

/** Convert a base64 VAPID key to Uint8Array for PushManager.subscribe(). */
function urlB64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer as ArrayBuffer
}

export interface SubscribeResult {
  success: boolean
  permission: PushPermission
  reason?: string
}

/** Request push permission and subscribe the browser. */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!isPushSupported()) {
    return { success: false, permission: 'unsupported', reason: 'Browser does not support push' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { success: false, permission: permission as PushPermission, reason: 'Permission denied' }
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) {
    return { success: false, permission: 'granted', reason: 'VAPID key not configured' }
  }

  try {
    const reg = await getSwRegistration()
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(vapidPublicKey),
    })

    await fetch(PUSH_SUBSCRIBE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })

    return { success: true, permission: 'granted' }
  } catch (err) {
    console.error('[push] subscribe failed:', err)
    return {
      success: false,
      permission: 'granted',
      reason: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/** Unsubscribe from push notifications. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  try {
    const reg = await getSwRegistration()
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    await fetch(PUSH_UNSUBSCRIBE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
    await sub.unsubscribe()
  } catch (err) {
    console.error('[push] unsubscribe failed:', err)
  }
}

/** Check if user is currently subscribed. */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH)
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    return sub !== null
  } catch {
    return false
  }
}
