import 'server-only'

import { verifyUserRequest } from '@/lib/userAuthServer'

/** Resolve end-user from Firebase Bearer token for social APIs. */
export async function requireSocialUser(
  request: Request
): Promise<{ uid: string; email: string | null } | null> {
  return verifyUserRequest(request)
}

