/**
 * Connection method → API host. Pure mapping shared by the target resolver and
 * the platform publishers, so a publish can never pick a host from untrusted
 * input. Instagram Login and Facebook Login never share a host.
 */
import { FACEBOOK_GRAPH_BASE, INSTAGRAM_LOGIN_GRAPH_BASE, THREADS_GRAPH_BASE } from '../graphConfig'
import type { SocialAccountPlatform, SocialConnectionMethod } from './types'

export function apiBaseFor(
  platform: SocialAccountPlatform,
  method: SocialConnectionMethod,
): string | null {
  if (platform === 'facebook') {
    return method === 'legacy' || method === 'facebook_login' ? FACEBOOK_GRAPH_BASE : null
  }
  if (platform === 'instagram') {
    if (method === 'instagram_login') return INSTAGRAM_LOGIN_GRAPH_BASE
    return method === 'legacy' || method === 'facebook_login' ? FACEBOOK_GRAPH_BASE : null
  }
  return method === 'legacy' || method === 'threads_oauth' ? THREADS_GRAPH_BASE : null
}
