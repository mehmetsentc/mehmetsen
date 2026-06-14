/**
 * GET /api/og/social/[id]
 *
 * ONYEDİTİVİ HABERLERİ — 1080×1080 sosyal medya görseli
 *
 * Layout:
 *   ┌────────────────────────────────────┐
 *   │                    [● 17 logo]     │  ← mavi blob logo, sağ üst
 *   │        HABER FOTOĞRAFI             │  ~55%
 *   ├────────────────────────────────────┤
 *   │  BAŞLIK  (kırmızı zemin)           │  ~22%
 *   ├────────────────────────────────────┤
 *   │  açıklama (koyu lacivert)          │  ~18%
 *   ├────────────────────────────────────┤
 *   │  DAHA FAZLASI İÇİN: NAHABER.COM   │  ~5%
 *   └────────────────────────────────────┘
 */
export const runtime = 'edge'

import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'

const PROJECT_ID = 'nahaberapp'
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/news`

interface ArticleOGData {
  title: string
  spot: string
  imageUrl: string
  thumbnail: string
  coverImageUrl: string
  featuredImage: string
  image: string
}

async function fetchArticle(id: string): Promise<ArticleOGData | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(`${FIREBASE_URL}/${id}?key=${apiKey}`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const data = await res.json() as { fields?: Record<string, { stringValue?: string }> }
    const f = data.fields
    if (!f) return null
    return {
      title:         f.title?.stringValue         || '',
      spot:          f.spot?.stringValue          || f.summary?.stringValue || f.description?.stringValue || '',
      imageUrl:      f.imageUrl?.stringValue      || '',
      thumbnail:     f.thumbnail?.stringValue     || '',
      coverImageUrl: f.coverImageUrl?.stringValue || '',
      featuredImage: f.featuredImage?.stringValue || '',
      image:         f.image?.stringValue         || '',
    }
  } catch { return null }
}

const SUPPORTED_EXTS = /\.(jpe?g|png|gif)(\?|$)/i

function bestImage(a: ArticleOGData): string {
  const candidates = [a.thumbnail, a.coverImageUrl, a.imageUrl, a.featuredImage, a.image]
  for (const c of candidates) {
    if (c && SUPPORTED_EXTS.test(c)) return c
  }
  for (const c of candidates) {
    if (c && !c.includes('.webp') && !c.includes('.avif')) return c
  }
  return ''
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

const PHOTO_H = 594
const TITLE_H = 238
const DESC_H  = 194
const FOOT_H  = 54

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const article = await fetchArticle(id)
  if (!article || !article.title) {
    return new Response('Haber bulunamadi', { status: 404 })
  }

  const photo = bestImage(article)
  const title = truncate(article.title, 72)
  const spot  = truncate(article.spot || '', 130)
  const titleFontSize = title.length > 60 ? 38 : title.length > 44 ? 44 : title.length > 30 ? 50 : 56

  return new ImageResponse(
    (
      <div style={{
        width: 1080, height: 1080,
        display: 'flex', flexDirection: 'column',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        overflow: 'hidden', background: '#111827',
      }}>

        {/* ── 1. FOTOĞRAF ── */}
        <div style={{
          width: 1080, height: PHOTO_H,
          position: 'relative', display: 'flex',
          overflow: 'hidden', flexShrink: 0,
          backgroundColor: '#1e3a5f',
        }}>
          {photo ? (
            <img src={photo} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'flex' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: 'linear-gradient(135deg, #1e3a5f 0%, #0d2b4e 60%, #071528 100%)',
              display: 'flex',
            }} />
          )}

          {/* ── LOGO BADGE: ONYEDİTİVİ mavi blob logosu ── */}
          {/* Beyaz yarı-saydam pill — fotoğraf üzerinde okunabilirlik için */}
          <div style={{
            position: 'absolute', top: 32, right: 32,
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderRadius: 100,
            display: 'flex', alignItems: 'center',
            padding: '10px 22px 10px 10px',
            gap: 14,
            boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
          }}>

            {/* ── ONYEDİTİVİ LOGO (mavi blob + 17) ── */}
            <div style={{
              width: 72, height: 72,
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {/* Blob katman 1 — en dış, açık mavi, döndürülmüş */}
              <div style={{
                position: 'absolute',
                width: 68, height: 68,
                backgroundColor: '#a8c8f0',
                borderRadius: 20,
                transform: 'rotate(12deg)',
                display: 'flex',
              }} />
              {/* Blob katman 2 — orta mavi */}
              <div style={{
                position: 'absolute',
                width: 64, height: 64,
                backgroundColor: '#5b8fd4',
                borderRadius: 18,
                transform: 'rotate(-6deg)',
                display: 'flex',
              }} />
              {/* Blob katman 3 — koyu mavi */}
              <div style={{
                position: 'absolute',
                width: 60, height: 60,
                backgroundColor: '#2a5cb0',
                borderRadius: 16,
                transform: 'rotate(3deg)',
                display: 'flex',
              }} />
              {/* İç daire — lacivert */}
              <div style={{
                position: 'absolute',
                width: 54, height: 54,
                backgroundColor: '#1a3480',
                borderRadius: '50%',
                display: 'flex',
              }} />
              {/* "17" yazısı */}
              <div style={{
                position: 'relative',
                display: 'flex', alignItems: 'baseline',
                zIndex: 10,
              }}>
                <span style={{
                  color: '#ffffff',
                  fontWeight: 900, fontSize: 28,
                  lineHeight: 1, display: 'flex',
                  marginRight: -2,
                }}>1</span>
                <span style={{
                  color: '#87ceeb',
                  fontWeight: 900, fontSize: 28,
                  lineHeight: 1, display: 'flex',
                }}>7</span>
              </div>
            </div>

            {/* Metin */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{
                color: '#111827', fontWeight: 900,
                fontSize: 19, letterSpacing: 0.5,
                display: 'flex',
              }}>ONYEDiTiVi</span>
              <span style={{
                color: '#6b7280', fontWeight: 500,
                fontSize: 12, letterSpacing: 2.5,
                display: 'flex',
              }}>HABERLERi</span>
            </div>
          </div>
        </div>

        {/* ── 2. BAŞLIK — kırmızı ── */}
        <div style={{
          width: 1080, height: TITLE_H,
          backgroundColor: '#dc2626',
          display: 'flex', alignItems: 'center',
          padding: '0 48px', flexShrink: 0,
        }}>
          <span style={{
            color: 'white',
            fontSize: titleFontSize, fontWeight: 900,
            lineHeight: 1.25, display: 'flex',
          }}>{title}</span>
        </div>

        {/* ── 3. AÇIKLAMA ── */}
        <div style={{
          width: 1080, height: DESC_H,
          backgroundColor: '#1f2937',
          display: 'flex', alignItems: 'center',
          padding: '0 48px', flexShrink: 0,
        }}>
          {spot ? (
            <span style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 26, lineHeight: 1.55, display: 'flex',
            }}>{spot}</span>
          ) : null}
        </div>

        {/* ── 4. FOOTER ── */}
        <div style={{
          width: 1080, height: FOOT_H,
          backgroundColor: '#111827',
          display: 'flex', alignItems: 'center',
          padding: '0 48px', flexShrink: 0,
        }}>
          <span style={{
            color: 'rgba(255,255,255,0.40)',
            fontSize: 16, fontWeight: 600,
            letterSpacing: 3, display: 'flex',
          }}>DAHA FAZLASI iCiN: WWW.NAHABER.COM</span>
        </div>

      </div>
    ),
    {
      width: 1080, height: 1080,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400' },
    }
  )
}
