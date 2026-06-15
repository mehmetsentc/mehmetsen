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

// Layout yükseklikleri — toplam 1080px
const PHOTO_H = 600   // fotoğraf
const TITLE_H = 200   // kırmızı başlık bandı
const DESC_H  = 220   // lacivert açıklama + footer (tek alan)
const FOOT_H  = 60    // DESC_H içinde kullanılan virtual footer yüksekliği (ref)

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
  const title = article.title   // tam başlık — kırpma yok
  const spot  = truncate(article.spot || '', 110)
  // Başlık uzunluğuna göre font boyutu — tam cümle sığsın, kırpma yok
  const titleFontSize =
    title.length > 110 ? 30 :
    title.length > 90  ? 34 :
    title.length > 70  ? 38 :
    title.length > 55  ? 42 :
    title.length > 40  ? 48 :
    title.length > 28  ? 54 : 62

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

          {/* ── LOGO BADGE — koyu lacivert dikdörtgen (Canva tasarımı) ── */}
          <div style={{
            position: 'absolute', top: 24, right: 24,
            backgroundColor: '#0d1f44',
            borderRadius: 10,
            display: 'flex', alignItems: 'center',
            padding: '10px 22px 10px 10px',
            gap: 10,
            boxShadow: '0 4px 24px rgba(0,0,0,0.55)',
          }}>
            {/* 17 logosu */}
            <div style={{
              width: 52, height: 52,
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <div style={{ position:'absolute', width:50, height:50, backgroundColor:'#1a4299', borderRadius:14, transform:'rotate(12deg)', display:'flex' }} />
              <div style={{ position:'absolute', width:46, height:46, backgroundColor:'#1a3480', borderRadius:'50%', display:'flex' }} />
              <div style={{ position:'relative', display:'flex', alignItems:'baseline', zIndex:10 }}>
                <span style={{ color:'#ffffff', fontWeight:900, fontSize:22, lineHeight:1, display:'flex', marginRight:-1 }}>1</span>
                <span style={{ color:'#60a5fa', fontWeight:900, fontSize:22, lineHeight:1, display:'flex' }}>7</span>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
              <span style={{ color:'#ffffff', fontWeight:900, fontSize:16, letterSpacing:0.5, display:'flex' }}>ONYEDiTiVi</span>
              <span style={{ color:'#93c5fd', fontWeight:500, fontSize:10, letterSpacing:2.5, display:'flex' }}>HABERLERi</span>
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
          padding: '18px 44px', flexShrink: 0,
          overflow: 'hidden',
        }}>
          <div style={{
            color: 'white',
            fontSize: titleFontSize, fontWeight: 900,
            lineHeight: 1.28,
            display: 'flex', flexDirection: 'column',
          }}>{title}</div>
        </div>

        {/* ── 3. AÇIKLAMA + FOOTER — lacivert gradient (Canva tasarımı) ── */}
        <div style={{
          width: 1080, height: DESC_H + FOOT_H,
          background: 'linear-gradient(135deg, #0d1f44 0%, #1a3480 60%, #0f2a5e 100%)',
          display: 'flex', flexDirection: 'column',
          padding: '28px 44px 20px 44px', flexShrink: 0,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Teal dalga dekorasyon — sağ alt */}
          <div style={{
            position: 'absolute', bottom: -60, right: -60,
            width: 280, height: 280,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(6,182,212,0.25) 0%, rgba(14,116,144,0.12) 50%, transparent 70%)',
            display: 'flex',
          }} />
          <div style={{
            position: 'absolute', bottom: 10, right: 80,
            width: 180, height: 80,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(6,182,212,0.18) 0%, transparent 70%)',
            display: 'flex',
          }} />

          {/* Açıklama metni */}
          <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
            {spot ? (
              <span style={{
                color: 'rgba(255,255,255,0.95)',
                fontSize: 28, fontWeight: 500, lineHeight: 1.5, display: 'flex',
              }}>{spot}</span>
            ) : (
              <span style={{
                color: 'rgba(255,255,255,0.55)',
                fontSize: 26, fontStyle: 'italic', display: 'flex',
              }}>nahaber.com'da haberin devamını okuyun</span>
            )}
          </div>

          {/* Footer metni */}
          <div style={{ display: 'flex' }}>
            <span style={{
              color: 'rgba(255,255,255,0.60)',
              fontSize: 15, fontWeight: 600,
              letterSpacing: 3, display: 'flex',
            }}>DAHA FAZLASI iCiN: WWW.NAHABER.COM</span>
          </div>
        </div>

      </div>
    ),
    {
      width: 1080, height: 1080,
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600' },
    }
  )
}
