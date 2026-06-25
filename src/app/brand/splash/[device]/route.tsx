import { ImageResponse } from 'next/og'

export const runtime = 'edge'

/**
 * Dinamik iOS PWA splash screen üretici.
 *
 * apple-touch-startup-image linkleri /brand/splash/iphone-14-pro-max.png
 * gibi URL'lere gelir. Bu route her cihaz için ImageResponse ile
 * markalı bir splash döndürür — static PNG dosyası tutmadan.
 *
 * Avantaj: yeni cihaz eklendiğinde sadece DEVICE_DIMENSIONS'a satır
 * ekle, görsel pipeline'a ihtiyaç yok.
 */

type DeviceSpec = {
  width: number
  height: number
}

const DEVICE_DIMENSIONS: Record<string, DeviceSpec> = {
  // iPhone modelleri (portrait, fizyolojik piksel @scale)
  'iphone-14-pro-max': { width: 1290, height: 2796 },   // 430×932 @3x
  'iphone-14-pro':     { width: 1179, height: 2556 },   // 393×852 @3x
  'iphone-14-plus':    { width: 1284, height: 2778 },   // 428×926 @3x
  'iphone-14':         { width: 1170, height: 2532 },   // 390×844 @3x
  'iphone-11-pro-max': { width: 1242, height: 2688 },   // 414×896 @3x
  'iphone-11-pro':     { width: 1125, height: 2436 },   // 375×812 @3x
  'iphone-11':         { width: 828,  height: 1792 },   // 414×896 @2x
  'iphone-se':         { width: 750,  height: 1334 },   // 375×667 @2x
  // iPad modelleri
  'ipad-pro-12':       { width: 2048, height: 2732 },   // 1024×1366 @2x
  'ipad-pro-11':       { width: 1668, height: 2388 },   // 834×1194 @2x
  'ipad-air':          { width: 1640, height: 2360 },   // 820×1180 @2x
}

const BRAND = {
  bg: '#0a0a0a',
  fg: '#dc2626',
  text: '#ffffff',
  muted: '#a3a3a3',
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ device: string }> }
) {
  const { device } = await ctx.params
  const slug = device.replace(/\.png$/i, '').toLowerCase()
  const dims = DEVICE_DIMENSIONS[slug] ?? DEVICE_DIMENSIONS['iphone-14']!

  const iconSize = Math.round(dims.width * 0.32)
  const titleSize = Math.round(dims.width * 0.075)
  const tagSize = Math.round(dims.width * 0.035)

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: `radial-gradient(ellipse at center, #1a0a0a 0%, ${BRAND.bg} 70%)`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: iconSize,
            height: iconSize,
            borderRadius: iconSize * 0.22,
            background: `linear-gradient(135deg, ${BRAND.fg} 0%, #991b1b 100%)`,
            boxShadow: '0 30px 80px rgba(220, 38, 38, 0.35)',
            marginBottom: iconSize * 0.18,
          }}
        >
          <div
            style={{
              fontSize: iconSize * 0.42,
              fontWeight: 900,
              color: BRAND.text,
              letterSpacing: '-0.04em',
            }}
          >
            N
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 800,
            color: BRAND.text,
            letterSpacing: '-0.03em',
            marginBottom: titleSize * 0.25,
          }}
        >
          NaHaber
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: tagSize,
            color: BRAND.muted,
            fontWeight: 500,
          }}
        >
          Türkiye&apos;nin anlık haber platformu
        </div>
      </div>
    ),
    {
      width: dims.width,
      height: dims.height,
      // PWA splash görseli, browser yüklenene kadar gösterilir → uzun cache
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
      },
    }
  )
}
