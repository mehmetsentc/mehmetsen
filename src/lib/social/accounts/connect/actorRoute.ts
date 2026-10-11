/** Shared guard for /api/social/* (any signed-in NaHaber user). */
import 'server-only'
import { NextResponse } from 'next/server'
import { resolveSocialActor, type SocialActor } from '../actor'
import { isSameOriginRequest, json } from './routeHelpers'

export async function requireActor(
  request: Request,
  options: { mutation: boolean },
): Promise<{ actor: SocialActor } | { response: NextResponse }> {
  if (options.mutation && !isSameOriginRequest(request)) {
    return { response: json({ error: 'Geçersiz istek kaynağı', code: 'bad_origin' }, 403) }
  }
  const actor = await resolveSocialActor(request)
  if (!actor) return { response: json({ error: 'Giriş gerekli', code: 'unauthorized' }, 401) }
  return { actor }
}
