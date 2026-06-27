/**
 * GET/POST /api/cron/sports/worldcup-sync
 *
 * 15 dakikada bir tetiklenir. ESPN public API'sinden 2026 FIFA Dünya Kupası
 * grup/maç verisini taze çekmek için cache tag'ini geçersiz kılar ve kategori
 * sayfa cache'ini de revalidate eder.
 *
 * Auth: Bearer CRON_SECRET (newsroomAuth ile aynı sistem)
 */
import { NextResponse } from 'next/server'
import { revalidateTag, revalidatePath } from 'next/cache'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import {
  getWorldCup2026Data,
  WORLDCUP_CACHE_TAG,
} from '@/services/sportsApi/worldCup2026'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function handler(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1) Cache tag'ini geçersiz kıl — bir sonraki getWorldCup2026Data() çağrısı
  //    ESPN'e yeni istek atar.
  revalidateTag(WORLDCUP_CACHE_TAG)

  // 2) Kategori sayfa cache'ini de yenile — ISR ile cache'lenmiş static HTML
  //    de güncellensin.
  revalidatePath('/kategori/dunya-kupasi-2026')

  // 3) Cache'i tazelemek için bir kez veriyi çek (warm-up). Hata olursa cron
  //    yine de başarılı sayılır — tag invalidate edildi.
  let warmed: { source: string; updatedAt: string; groups: number; matches: number } | null = null
  try {
    const data = await getWorldCup2026Data()
    warmed = {
      source: data.source,
      updatedAt: data.updatedAt,
      groups: data.groups.length,
      matches: data.matches.length,
    }
  } catch (err) {
    console.warn('[cron/worldcup-sync] warm-up failed', err)
  }

  return NextResponse.json({
    ok: true,
    revalidatedTag: WORLDCUP_CACHE_TAG,
    revalidatedPath: '/kategori/dunya-kupasi-2026',
    warmed,
    timestamp: new Date().toISOString(),
  })
}

export async function GET(request: Request) {
  return handler(request)
}

export async function POST(request: Request) {
  return handler(request)
}
