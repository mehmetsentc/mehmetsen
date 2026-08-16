import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getSiteSettings, saveSiteSettings } from '@/services/siteSettings.server'
import type { SiteSettings } from '@/lib/siteSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const settings = await getSiteSettings()
  return NextResponse.json({ settings })
}

export async function PUT(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Partial<SiteSettings>
  try {
    body = (await request.json()) as Partial<SiteSettings>
  } catch {
    return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 })
  }

  const settings = await saveSiteSettings(body, auth.email || auth.uid)
  try {
    revalidateTag('site-settings')
    revalidatePath('/')
    revalidatePath('/feed')
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ settings })
}
