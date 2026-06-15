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

// Layout yükseklikleri
const PHOTO_H = 620   // fotoğraf biraz daha büyük
const TITLE_H = 220   // kırmızı başlık bandı
const DESC_H  = 180   // beyaz açıklama alanı
const FOOT_H  = 60    // footer

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
  const spot  = truncate(article.spot || '', 120)
  const titleFontSize = title.length > 60 ? 36 : title.length > 44 ? 42 : title.length > 30 ? 48 : 54

  return new ImageResponse(
    (
      <div style={{
        width: 1080, height: 1080,
        display: 'flex', flexDirection: 'column',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        overflow: 'hidden', background: '#ffffff',
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
            /* Fotoğraf yoksa: koyu mavi gradyan + geometrik desen */
            <div style={{
              width: '100%', height: '100%', display: 'flex',
              background: 'linear-gradient(150deg, #1a3a6e 0%, #0f2347 50%, #071528 100%)',
              position: 'relative',
            }}>
              {/* Dekoratif daireler */}
              <div style={{
                position: 'absolute', width: 480, height: 480,
                borderRadius: '50%', border: '2px solid rgba(255,255,255,0.06)',
                bottom: -160, right: -80, display: 'flex',
              }} />
              <div style={{
                position: 'absolute', width: 320, height: 320,
                borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)',
                bottom: -80, right: 40, display: 'flex',
              }} />
              <div style={{
                position: 'absolute', width: 180, height: 180,
                borderRadius: '50%', backgroundColor: 'rgba(59,130,246,0.12)',
                top: 60, left: -40, display: 'flex',
              }} />
            </div>
          )}

          {/* ── LOGO BADGE ── */}
          <div style={{
            position: 'absolute', top: 28, right: 28,
            backgroundColor: 'rgba(255,255,255,0.95)',
            borderRadius: 100,
            display: 'flex', alignItems: 'center',
            padding: '8px 20px 8px 8px',
            gap: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.30)',
          }}>
            {/* 17 logosu */}
            <div style={{
              width: 64, height: 64,
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <div style={{ position:'absolute', width:60, height:60, backgroundColor:'#a8c8f0', borderRadius:18, transform:'rotate(12deg)', display:'flex' }} />
              <div style={{ position:'absolute', width:56, height:56, backgroundColor:'#5b8fd4', borderRadius:16, transform:'rotate(-6deg)', display:'flex' }} />
              <div style={{ position:'absolute', width:52, height:52, backgroundColor:'#2a5cb0', borderRadius:14, transform:'rotate(3deg)', display:'flex' }} />
              <div style={{ position:'absolute', width:46, height:46, backgroundColor:'#1a3480', borderRadius:'50%', display:'flex' }} />
              <div style={{ position:'relative', display:'flex', alignItems:'baseline', zIndex:10 }}>
                <span style={{ color:'#ffffff', fontWeight:900, fontSize:24, lineHeight:1, display:'flex', marginRight:-1 }}>1</span>
                <span style={{ color:'#87ceeb', fontWeight:900, fontSize:24, lineHeight:1, display:'flex' }}>7</span>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
              <span style={{ color:'#111827', fontWeight:900, fontSize:17, letterSpacing:0.5, display:'flex' }}>ONYEDiTiVi</span>
              <span style={{ color:'#6b7280', fontWeight:500, fontSize:11, letterSpacing:2.5, display:'flex' }}>HABERLERi</span>
            </div>
          </div>

          {/* ── Fotoğraf alt geçiş — koyu gradient ── */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
            background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)',
            display: 'flex',
          }} />
        </div>

        {/* ── 2. BAŞLIK — kırmızı ── */}
        <div style={{
          width: 1080, height: TITLE_H,
          backgroundColor: '#dc2626',
          display: 'flex', alignItems: 'center',
          padding: '0 44px', flexShrink: 0,
        }}>
          <span style={{
            color: 'white',
            fontSize: titleFontSize, fontWeight: 900,
            lineHeight: 1.22, display: 'flex',
          }}>{title}</span>
        </div>

        {/* ── 3. AÇIKLAMA — beyaz ── */}
        <div style={{
          width: 1080, height: DESC_H,
          backgroundColor: '#ffffff',
          display: 'flex', alignItems: 'center',
          padding: '0 44px', flexShrink: 0,
          borderTop: '3px solid #f3f4f6',
        }}>
          {spot ? (
            <span style={{
              color: '#374151',
              fontSize: 24, lineHeight: 1.5, display: 'flex',
            }}>{spot}</span>
          ) : (
            <span style={{
              color: '#9ca3af',
              fontSize: 22, fontStyle: 'italic', display: 'flex',
            }}>nahaber.com'da haberin devamını okuyun</span>
          )}
        </div>

        {/* ── 4. FOOTER — lacivert ── */}
        <div style={{
          width: 1080, height: FOOT_H,
          backgroundColor: '#1a3480',
          display: 'flex', alignItems: 'center',
          padding: '0 44px', flexShrink: 0,
        }}>
          <span style={{
            color: 'rgba(255,255,255,0.70)',
            fontSize: 15, fontWeight: 600,
            letterSpacing: 3, display: 'flex',
          }}>DAHA FAZLASI iCiN: WWW.NAHABER.COM</span>
        </div>

      </div>
    ),
    {
      width: 1080, height: 1080,
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600' },
    }
  )
}
