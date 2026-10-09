/**
 * Resolved publish targets (server-side only at runtime).
 *
 * `accessToken` is attached as a NON-ENUMERABLE property by the resolver, so
 * JSON.stringify / console.log / spreading a target never prints it.
 * Type-only module: platform publishers import these types without pulling in
 * Firestore or crypto code.
 */
import type { SocialConnectionMethod } from './types'

interface PublishTargetBase {
  accountId: string
  connectionMethod: SocialConnectionMethod
  /** API host+version for this connection (see apiHosts.ts). */
  apiBase: string
  /** Server-only secret. Non-enumerable at runtime. */
  readonly accessToken: string
}

export interface FacebookPublishTarget extends PublishTargetBase {
  platform: 'facebook'
  pageId: string
  /** Legacy Onyeditivi path only: BYO (custom) vs global Meta app attribution. */
  legacyCredentialMode: 'custom' | 'global' | null
  appId: string | null
  appName: string | null
}

export interface InstagramPublishTarget extends PublishTargetBase {
  platform: 'instagram'
  igUserId: string
}

export interface ThreadsPublishTarget extends PublishTargetBase {
  platform: 'threads'
  threadsUserId: string
}

export type PublishTarget = FacebookPublishTarget | InstagramPublishTarget | ThreadsPublishTarget
