import { verifyCmsToken } from '@/lib/cmsAuthServer'

/** Legacy alias — delegates to CMS RBAC with news publish permission. */
export async function verifyAdminRequest(request: Request): Promise<{ uid: string } | null> {
  const auth = await verifyCmsToken(request, 'news:publish')
  if (!auth) return null
  return { uid: auth.uid }
}
