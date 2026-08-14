import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  getCityOpsSettings,
  listCityOpsSettings,
  upsertCityOpsSettings,
} from '@/services/newsroomOs/cityOpsService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'locations:manage')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const city = request.nextUrl.searchParams.get('city')
  if (city) {
    const settings = await getCityOpsSettings(city)
    return NextResponse.json({ settings })
  }
  const settings = await listCityOpsSettings()
  return NextResponse.json({ settings })
}

export async function PUT(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'locations:manage')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as { citySlug?: string; patch?: Record<string, unknown> }
  if (!body.citySlug) return NextResponse.json({ error: 'citySlug required' }, { status: 400 })

  const settings = await upsertCityOpsSettings(body.citySlug, body.patch ?? {}, auth.uid)
  return NextResponse.json({ settings })
}
