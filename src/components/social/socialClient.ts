'use client'

import { auth } from '@/lib/firebase/auth'
import type { SocialAccountPublic } from '@/lib/social/accounts/types'
import type { PublishFormat, TargetBlocker } from '@/lib/social/accounts/capabilities'
import type { AccountPublishScope } from '@/lib/social/accounts/publishScope'

export type SocialAccountRow = SocialAccountPublic & {
  canManage: boolean
  canPublish: boolean
  formats: PublishFormat[]
  publishScope?: AccountPublishScope
  health: { connected: boolean; publishBlocker: TargetBlocker | null; tokenExpiresAt: number | null; tokenWarning: boolean }
}

export type SocialMe = {
  central: boolean
  provinces: string[]
  staff: boolean
  publishers: Array<{ id: string; name: string; canManage: boolean }>
  platforms: Record<string, { ready: boolean; publicAccess?: 'approved' | 'pending' }>
}

/** Authenticated JSON call to /api/social/* — never sends secrets, never reads tokens. */
export async function socialApi<T>(path: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string; action?: string; status: number }> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    })
  } catch {
    return { ok: false, error: 'Ağ hatası — istek sunucuya ulaşmadı', status: 0 }
  }
  let body: Record<string, unknown> | null = null
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch {
    return { ok: false, error: `Sunucu yanıtı okunamadı (HTTP ${res.status})`, status: res.status }
  }
  if (!res.ok) {
    return {
      ok: false,
      error: typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`,
      code: typeof body?.code === 'string' ? body.code : undefined,
      action: typeof body?.action === 'string' ? body.action : undefined,
      status: res.status,
    }
  }
  return { ok: true, data: body as T }
}

export const PLATFORM_LABEL: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads' }

export function ownerLabel(a: Pick<SocialAccountPublic, 'ownerKind' | 'ownership'>, publisherNames: Record<string, string> = {}): string {
  switch (a.ownerKind) {
    case 'user':
      return 'Kişisel hesap'
    case 'publisher':
      return `Yayıncı: ${publisherNames[a.ownership.publisherId ?? ''] ?? a.ownership.publisherId}`
    case 'central':
      return 'NaHaber merkez'
    default:
      return `İl: ${a.ownership.citySlug}`
  }
}
