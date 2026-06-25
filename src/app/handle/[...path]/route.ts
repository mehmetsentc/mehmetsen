import { NextResponse } from 'next/server'

export const runtime = 'edge'

/**
 * web+nahaber:// protocol handler.
 *
 * Manifest'te `protocol_handlers: [{ protocol: "web+nahaber", url: "/handle/%s" }]`
 * tanımlı. Kullanıcı bir link/uygulamada `web+nahaber://haber/abc` yazdığında
 * tarayıcı NaHaber PWA'sını açar ve bu route'a /handle/haber%2Fabc isteği gelir.
 *
 * Biz de URL'i decode edip uygun route'a yönlendiriyoruz.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params
  if (!path || path.length === 0) {
    return NextResponse.redirect(new URL('/feed', req.url))
  }
  const joined = path.join('/')

  // Güvenli destination: yalnızca kendi domainimize yönlendir.
  // Path'i / ile birleştir ve external URL'leri engelle.
  let safePath = `/${joined.replace(/^\/+/, '')}`

  // Decoded path bir external URL ise → /feed'e gönder
  try {
    const probe = new URL(decodeURIComponent(safePath), req.url)
    if (probe.origin !== new URL(req.url).origin) {
      return NextResponse.redirect(new URL('/feed', req.url))
    }
    safePath = probe.pathname + probe.search
  } catch {
    /* path zaten relative — sorun yok */
  }

  return NextResponse.redirect(new URL(safePath, req.url))
}
