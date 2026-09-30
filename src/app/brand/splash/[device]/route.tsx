import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

let splashMark: string | null = null

async function splashMarkSrc(): Promise<string> {
  if (splashMark) return splashMark
  const buf = await readFile(join(process.cwd(), 'public/brand/splash-mark.png'))
  splashMark = `data:image/png;base64,${buf.toString('base64')}`
  return splashMark
}

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
  'iphone-16-pro-max': { width: 1320, height: 2868 },   // 440×956 @3x
  'iphone-16-pro':     { width: 1206, height: 2622 },   // 402×874 @3x
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

const SPLASH_BG = '#070b16'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ device: string }> }
) {
  const { device } = await ctx.params
  const slug = device.replace(/\.png$/i, '').toLowerCase()
  const dims = DEVICE_DIMENSIONS[slug] ?? DEVICE_DIMENSIONS['iphone-14']!

  const iconSize = Math.round(dims.width * 0.42)
  const mark = await splashMarkSrc()

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: SPLASH_BG,
        }}
      >
        <img src={mark} alt="" width={iconSize} height={iconSize} />
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
