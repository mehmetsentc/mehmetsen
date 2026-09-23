import { NextResponse } from 'next/server'
import { getCategoryStoryGroups } from '@/services/newsService.server'

export const dynamic = 'force-dynamic'

/** Mobile home category rings — last 24h, max 10 per category. */
export async function GET() {
  try {
    const groups = await getCategoryStoryGroups()
    return NextResponse.json({ groups })
  } catch (error) {
    console.warn('[api/home/category-stories]', error)
    return NextResponse.json({ groups: [] })
  }
}
