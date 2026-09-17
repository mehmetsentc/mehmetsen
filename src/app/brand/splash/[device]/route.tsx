import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const runtime = 'nodejs'

/**
 * Dinamik iOS PWA splash — uses the rounded NaHaber N boot mark PNG.
 */

type DeviceSpec = {
  width: number
  height: number
}

const DEVICE_DIMENSIONS: Record<string, DeviceSpec> = {
  'iphone-14-pro-max': { width: 1290, height: 2796 },
  'iphone-14-pro': { width: 1179, height: 2556 },
  'iphone-14-plus': { width: 1284, height: 2778 },
  'iphone-14': { width: 1170, height: 2532 },
  'iphone-11-pro-max': { width: 1242, height: 2688 },
  'iphone-11-pro': { width: 1125, height: 2436 },
  'iphone-11': { width: 828, height: 1792 },
  'iphone-se': { width: 750, height: 1334 },
  'ipad-pro-12': { width: 2048, height: 2732 },
  'ipad-pro-11': { width: 1668, height: 2388 },
  'ipad-air': { width: 1640, height: 2360 },
}

const BRAND = {
  bg: '#000000',
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

  const iconSize = Math.round(dims.width * 0.34)
  const titleSize = Math.round(dims.width * 0.075)
  const tagSize = Math.round(dims.width * 0.035)

  const markBytes = await readFile(
    join(process.cwd(), 'public/brand/nahaber-boot-mark.png')
  )
  const markSrc = `data:image/png;base64,${markBytes.toString('base64')}`

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
          background: `radial-gradient(ellipse at center, #1a0a0a 0%, ${BRAND.bg} 72%)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={markSrc}
          width={iconSize}
          height={iconSize}
          alt=""
          style={{
            width: iconSize,
            height: iconSize,
            borderRadius: Math.round(iconSize * 0.22),
            marginBottom: Math.round(iconSize * 0.16),
          }}
        />
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
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
      },
    }
  )
}
