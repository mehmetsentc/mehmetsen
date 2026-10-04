import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { canManageProvinceSettings, isScopeRestricted } from '@/lib/cms/rbacScope'
import { denyIfCannotManageProvince } from '@/lib/cms/staffScopeHttp'
import {
  getCityOpsSettings,
  listCityOpsSettings,
  upsertCityOpsSettings,
} from '@/services/newsroomOs/cityOpsService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'locations:manage', { scopeAware: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const city = request.nextUrl.searchParams.get('city')
  if (city) {
    const denied = denyIfCannotManageProvince(auth, city)
    if (denied) return denied
    const settings = await getCityOpsSettings(city)
    return NextResponse.json({ settings })
  }
  const all = await listCityOpsSettings()
  // Scoped province admins only see their own provinces' settings.
  const settings = isScopeRestricted(auth.scope)
    ? all.filter((s) => canManageProvinceSettings(auth.scope, s.citySlug))
    : all
  return NextResponse.json({ settings })
}

export async function PUT(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'locations:manage', { scopeAware: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as { citySlug?: string; patch?: Record<string, unknown> }
  if (!body.citySlug) return NextResponse.json({ error: 'citySlug required' }, { status: 400 })
  // The doc id IS body.citySlug, so scoped staff must send the exact canonical slug.
  const denied = denyIfCannotManageProvince(auth, body.citySlug)
  if (denied) return denied
  if (isScopeRestricted(auth.scope) && body.citySlug !== body.citySlug.trim().toLowerCase()) {
    return NextResponse.json({ error: 'citySlug must be canonical' }, { status: 400 })
  }

  const settings = await upsertCityOpsSettings(body.citySlug, body.patch ?? {}, auth.uid)
  return NextResponse.json({ settings })
}
