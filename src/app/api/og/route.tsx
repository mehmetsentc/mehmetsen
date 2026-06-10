/**
 * Dynamic OG image generation.
 * Usage: /api/og?title=...&category=...&image=...
 *
 * Generates a 1200×630 branded card for social sharing.
 */
import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const runtime = 'edge'

const BRAND_RED = '#dc2626'
const BG_DARK   = '#0a0a0a'
const WHITE      = '#ffffff'
const MUTED      = 'rgba(255,255,255,0.55)'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const title    = (searchParams.get('title')    || 'NaHaber').slice(0, 120)
  const category = (searchParams.get('category') || '').slice(0, 30)
  const imageUrl = searchParams.get('image') || null
  const siteName = 'NaHaber'
  const siteUrl  = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'nahaber.com'
  const domain   = siteUrl.replace(/^https?:\/\//, '')

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: BG_DARK,
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Background image with dark overlay */}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.25,
            }}
          />
        )}

        {/* Red accent bar top */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: BRAND_RED,
          }}
        />

        {/* Gradient overlay bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '60%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, transparent 100%)',
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '40px 60px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Category badge */}
          {category && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  background: BRAND_RED,
                  color: WHITE,
                  fontSize: '18px',
                  fontWeight: 700,
                  padding: '4px 16px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {category}
              </span>
            </div>
          )}

          {/* Title */}
          <div
            style={{
              color: WHITE,
              fontSize: title.length > 80 ? '32px' : '40px',
              fontWeight: 800,
              lineHeight: 1.25,
              maxWidth: '1000px',
            }}
          >
            {title}
          </div>

          {/* Footer: site name + domain */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: '8px',
            }}
          >
            <span
              style={{
                color: BRAND_RED,
                fontSize: '22px',
                fontWeight: 900,
                letterSpacing: '-0.02em',
              }}
            >
              {siteName}
            </span>
            <span style={{ color: MUTED, fontSize: '18px' }}>•</span>
            <span style={{ color: MUTED, fontSize: '18px' }}>{domain}</span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    }
  )
}
