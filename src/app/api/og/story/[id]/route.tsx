/**
 * GET /api/og/story/[id]
 *
 * ONYEDİTİVİ — 1080×1920 Instagram & Facebook Hikaye görseli (9:16)
 *
 * Layout (yukarıdan aşağı):
 *   ┌─────────────────────────┐
 *   │  [Logo badge sağ üst]   │
 *   │                         │
 *   │   HABER FOTOĞRAFI       │  60% (1152px)
 *   │                         │
 *   ├─ ■ nahaber.com ─────────┤  geçiş satırı
 *   │                         │
 *   │   BAŞLIK / MANŞET       │  kalan alan
 *   │                         │
 *   │   #hashtag              │
 *   └─────────────────────────┘
 */
export const runtime = 'nodejs'

import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'

const PROJECT_ID = 'nahaberapp'
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/news`

interface ArticleData {
  title: string
  spot: string
  imageUrl: string
  thumbnail: string
  coverImageUrl: string
  featuredImage: string
  image: string
}

async function fetchArticle(id: string): Promise<ArticleData | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(`${FIREBASE_URL}/${id}?key=${apiKey}`, { cache: 'no-store' })
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

const SUPPORTED = /\.(jpe?g|png|gif|webp|avif)(\?|$)/i
const UNSUPPORTED = /\.(svg|bmp|tiff?)(\?|$)/i

function isValidUrl(url: string | undefined): url is string {
  if (!url || !url.startsWith('http')) return false
  if (url.endsWith('/') || url.endsWith('-') || url.endsWith('_')) return false
  if ((url.split('/').pop() ?? '').length < 4) return false
  return !UNSUPPORTED.test(url)
}

function bestImage(a: ArticleData): string {
  const candidates = [a.thumbnail, a.coverImageUrl, a.imageUrl, a.featuredImage, a.image]
  for (const c of candidates) if (isValidUrl(c) && SUPPORTED.test(c)) return c
  for (const c of candidates) if (isValidUrl(c)) return c
  return ''
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// Boyutlar
const W = 1080
const H = 1920
const PHOTO_H = 1152  // %60
const MID_H   = 96    // geçiş satırı
const TITLE_H = H - PHOTO_H - MID_H  // ~672px

function fallback() {
  return new ImageResponse(
    <div style={{ width: W, height: H, display: 'flex', background: '#000' }}>
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 40, margin: 'auto', display: 'flex' }}>NaHaber</span>
    </div>,
    { width: W, height: H }
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let article: ArticleData | null = null
  try { article = await fetchArticle(id) } catch { return fallback() }
  if (!article?.title) return new Response('Haber bulunamadi', { status: 404 })

  const photo = bestImage(article)
  const title = article.title
  const titleSize =
    title.length > 120 ? 38 :
    title.length > 90  ? 44 :
    title.length > 70  ? 50 :
    title.length > 50  ? 56 :
    title.length > 35  ? 64 : 72

  try {
    return new ImageResponse(
      <div style={{
        width: W, height: H, display: 'flex', flexDirection: 'column',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        background: '#000000', overflow: 'hidden',
      }}>

        {/* ── FOTOĞRAF ── */}
        <div style={{
          width: W, height: PHOTO_H, position: 'relative',
          display: 'flex', flexShrink: 0, overflow: 'hidden',
          background: 'linear-gradient(160deg,#1c2d45 0%,#0d1a2e 50%,#050c18 100%)',
        }}>
          {photo ? (
            <img src={photo} alt="" width={W} height={PHOTO_H}
              style={{ width: W, height: PHOTO_H, objectFit: 'cover', display: 'flex' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex',
              background: 'linear-gradient(160deg,#1c2d45,#0d1a2e,#050c18)' }} />
          )}

          {/* Alt gradient */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 360,
            background: 'linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 100%)',
            display: 'flex',
          }} />

          {/* Logo badge */}
          <div style={{
            position: 'absolute', top: 40, right: 40,
            background: 'rgba(13,31,68,0.92)', borderRadius: 14,
            display: 'flex', alignItems: 'center',
            padding: '12px 22px 12px 12px', gap: 10,
          }}>
            <div style={{ width: 52, height: 52, position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ position: 'absolute', width: 50, height: 50, background: '#1a4299',
                borderRadius: 14, transform: 'rotate(12deg)', display: 'flex' }} />
              <div style={{ position: 'absolute', width: 46, height: 46, background: '#1a3480',
                borderRadius: '50%', display: 'flex' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', zIndex: 10 }}>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: 22, lineHeight: 1, display: 'flex', marginRight: -1 }}>1</span>
                <span style={{ color: '#60a5fa', fontWeight: 900, fontSize: 22, lineHeight: 1, display: 'flex' }}>7</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 18, letterSpacing: 0.5, display: 'flex' }}>ONYEDiTiVi</span>
              <span style={{ color: '#93c5fd', fontWeight: 500, fontSize: 11, letterSpacing: 3, display: 'flex' }}>HABERLERi</span>
            </div>
          </div>
        </div>

        {/* ── GEÇİŞ SATIRI: kırmızı bar + nahaber.com ── */}
        <div style={{
          width: W, height: MID_H, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding: '0 40px', gap: 20, background: '#000000',
        }}>
          <div style={{ width: 48, height: 12, background: '#dc2626', borderRadius: 6, display: 'flex', flexShrink: 0 }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,255,255,0.12)', borderRadius: 40,
            padding: '10px 24px',
          }}>
            <span style={{ fontSize: 28, display: 'flex' }}>🔗</span>
            <span style={{ color: '#ffffff', fontSize: 26, fontWeight: 700, display: 'flex' }}>nahaber.com</span>
          </div>
        </div>

        {/* ── BAŞLIK ALANI ── */}
        <div style={{
          width: W, height: TITLE_H, flexShrink: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '32px 40px 36px', background: '#000000',
        }}>
          <span style={{
            color: '#ffffff', fontWeight: 900, fontSize: titleSize,
            lineHeight: 1.38, display: 'flex', flexDirection: 'column',
          }}>{title}</span>
          <span style={{
            color: 'rgba(255,255,255,0.30)', fontSize: 22,
            fontWeight: 500, letterSpacing: 2, display: 'flex',
          }}>#NaHaber  #Çanakkale  #SonDakika</span>
        </div>

      </div>,
      {
        width: W, height: H,
        headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=300' },
      }
    )
  } catch {
    return fallback()
  }
}
