/**
 * GET /api/og/story/[id]
 *
 * ONYEDİTİVİ — 1080×1920 Instagram & Facebook Hikaye görseli (9:16)
 * Renk paleti: OnyediTivi laciveri (#0d2355) + NaHaber kırmızısı (#CC0000)
 *
 * Layout (yukarıdan aşağı):
 *   ┌─────────────────────────┐
 *   │  [Logo badge sağ üst]   │
 *   │                         │
 *   │   HABER FOTOĞRAFI       │  60% (1152px)
 *   │                         │
 *   ├─── nahaber.com ─────────┤  tam kırmızı bar + beyaz pill
 *   │                         │
 *   │   BAŞLIK / MANŞET       │  kalan alan — lacivert bg
 *   │   ║ kırmızı sol çizgi   │
 *   │   #hashtag açık mavi    │
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

// Boyutlar — 9:16 hikaye
const W = 1080
const H = 1920
const PHOTO_H = 1152  // %60
const MID_H   = 80    // kırmızı geçiş barı
const TITLE_H = H - PHOTO_H - MID_H  // ~688px

// Renkler
const NAVY   = '#0d2355'   // OnyediTivi koyu lacivert
const RED    = '#CC0000'   // NaHaber kırmızısı
const BLUE   = '#2563b8'   // OnyediTivi orta mavi
const LBLUE  = '#62b8e8'   // OnyediTivi açık mavi (hashtag)

function fallback() {
  return new ImageResponse(
    <div style={{ width: W, height: H, display: 'flex', background: NAVY }}>
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
    title.length > 50  ? 58 :
    title.length > 35  ? 66 : 76

  try {
    return new ImageResponse(
      <div style={{
        width: W, height: H, display: 'flex', flexDirection: 'column',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        background: NAVY, overflow: 'hidden',
      }}>

        {/* ── FOTOĞRAF ── */}
        <div style={{
          width: W, height: PHOTO_H, position: 'relative',
          display: 'flex', flexShrink: 0, overflow: 'hidden',
          background: NAVY,
        }}>
          {photo ? (
            <img src={photo} alt="" width={W} height={PHOTO_H}
              style={{ width: W, height: PHOTO_H, objectFit: 'cover', display: 'flex' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', background: NAVY }} />
          )}

          {/* Alt gradient → lacivert */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 400,
            background: `linear-gradient(to top,${NAVY} 0%,rgba(13,35,85,0.5) 50%,transparent 100%)`,
            display: 'flex',
          }} />

          {/* OnyediTivi logo badge — sağ üst */}
          <div style={{
            position: 'absolute', top: 40, right: 40,
            display: 'flex', alignItems: 'center',
            background: 'rgba(13,35,85,0.88)', borderRadius: 14,
            padding: '12px 24px 12px 12px', gap: 14,
          }}>
            {/* 17 rozeti — iç içe katmanlar */}
            <div style={{ width: 64, height: 64, position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {/* arka açık mavi blob */}
              <div style={{ position: 'absolute', width: 64, height: 58,
                background: '#8bbde0', borderRadius: '45% 55% 50% 50% / 50% 50% 55% 45%',
                display: 'flex' }} />
              {/* orta mavi */}
              <div style={{ position: 'absolute', width: 56, height: 56,
                background: BLUE, borderRadius: '38% 62% 55% 45% / 45% 55% 62% 38%',
                display: 'flex' }} />
              {/* iç koyu daire */}
              <div style={{ position: 'absolute', width: 46, height: 46,
                background: NAVY, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 0 }}>
                  <span style={{ color: '#ffffff', fontWeight: 900, fontSize: 22, lineHeight: 1, display: 'flex' }}>1</span>
                  <span style={{ color: LBLUE, fontWeight: 900, fontSize: 22, lineHeight: 1, display: 'flex' }}>7</span>
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ color: '#ffffff', fontWeight: 900, fontSize: 22, letterSpacing: 0.5, display: 'flex' }}>ONYEDiTiVi</span>
              <span style={{ color: LBLUE, fontWeight: 600, fontSize: 13, letterSpacing: 3, display: 'flex' }}>HABERLERi</span>
            </div>
          </div>
        </div>

        {/* ── GEÇİŞ SATIRI: tam kırmızı bar + nahaber.com pill ── */}
        <div style={{
          width: W, height: MID_H, flexShrink: 0,
          background: RED,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 44px', gap: 0,
        }}>
          {/* sol yatay çizgi */}
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.25)', display: 'flex' }} />
          {/* nahaber.com pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#ffffff', borderRadius: 50,
            padding: '10px 32px',
            margin: '0 24px',
          }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: RED, display: 'flex', flexShrink: 0 }} />
            <span style={{ color: RED, fontSize: 28, fontWeight: 800, letterSpacing: 0.3, display: 'flex' }}>nahaber.com</span>
          </div>
          {/* sağ yatay çizgi */}
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.25)', display: 'flex' }} />
        </div>

        {/* ── BAŞLIK ALANI ── */}
        <div style={{
          width: W, height: TITLE_H, flexShrink: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '36px 44px 40px', background: NAVY,
        }}>
          {/* Başlık — sol kırmızı çizgi + metin */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 22, flex: 1 }}>
            <div style={{ width: 7, borderRadius: 4, background: RED, flexShrink: 0, alignSelf: 'stretch', display: 'flex' }} />
            <span style={{
              color: '#ffffff', fontWeight: 900, fontSize: titleSize,
              lineHeight: 1.35, display: 'flex', flexDirection: 'column',
            }}>{title}</span>
          </div>
          {/* Hashtags */}
          <span style={{
            color: LBLUE, fontSize: 26,
            fontWeight: 600, letterSpacing: 1.5, display: 'flex',
            marginTop: 28,
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
