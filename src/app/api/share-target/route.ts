import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

/**
 * Web Share Target API endpoint.
 *
 * Kullanıcı başka bir uygulamadan (X, WhatsApp, Twitter vs.) bir URL/text
 * paylaştığında ve NaHaber PWA yüklüyse, hedef olarak bu route'a POST eder.
 * Bizim de bunu /ara veya /post/create'e yönlendirmemiz gerek.
 *
 * Form params (multipart/form-data, manifest'ten):
 *   title  → paylaşılan başlık
 *   text   → paylaşılan metin
 *   url    → paylaşılan URL (varsa)
 *
 * Akış:
 *   - URL varsa: /ara?q=<url>  → arama ile haber bul
 *   - Sadece text/title varsa: /ara?q=<text>
 *   - Login kullanıcı için ileride /post/create?prefill=... destekleyebiliriz
 */
export async function POST(req: Request) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.redirect(new URL('/feed', req.url))
  }

  const title = (formData.get('title') as string | null)?.trim() ?? ''
  const text = (formData.get('text') as string | null)?.trim() ?? ''
  const url = (formData.get('url') as string | null)?.trim() ?? ''

  const query = url || text || title

  if (!query) {
    return NextResponse.redirect(new URL('/feed', req.url))
  }

  const target = new URL('/ara', req.url)
  target.searchParams.set('q', query.slice(0, 256))
  target.searchParams.set('utm_source', 'share-target')

  return NextResponse.redirect(target, 303)
}

// GET fallback — kullanıcı manuel ziyaret ederse feed'e gönder
export async function GET(req: Request) {
  return NextResponse.redirect(new URL('/feed', req.url))
}
