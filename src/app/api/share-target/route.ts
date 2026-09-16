import { NextResponse } from 'next/server'
import { ROUTES } from '@/constants/routes'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

/**
 * Web Share Target API endpoint.
 *
 * Kullanıcı başka bir uygulamadan (X, WhatsApp, Twitter vs.) bir URL/text
 * paylaştığında ve NaHaber PWA yüklüyse, hedef olarak bu route'a POST eder.
 *
 * Form params (multipart/form-data, manifest'ten):
 *   title  → paylaşılan başlık
 *   text   → paylaşılan metin
 *   url    → paylaşılan URL (varsa)
 *
 * Akış:
 *   - URL varsa: /ara?q=<url>  → arama ile haber bul
 *   - Sadece text/title varsa: /ara?q=<text>
 */
export async function POST(req: Request) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.redirect(new URL(ROUTES.HOME, req.url))
  }

  const title = (formData.get('title') as string | null)?.trim() ?? ''
  const text = (formData.get('text') as string | null)?.trim() ?? ''
  const url = (formData.get('url') as string | null)?.trim() ?? ''

  const query = url || text || title

  if (!query) {
    return NextResponse.redirect(new URL(ROUTES.HOME, req.url))
  }

  const target = new URL(ROUTES.SEARCH, req.url)
  target.searchParams.set('q', query.slice(0, 256))
  target.searchParams.set('utm_source', 'share-target')

  return NextResponse.redirect(target, 303)
}

export async function GET(req: Request) {
  return NextResponse.redirect(new URL(ROUTES.HOME, req.url))
}
