/**
 * GET /api/og/social/[id]
 *
 * Onyedi Tivi marka stilinde 1080×1080 sosyal medya görseli.
 * Tasarım: üst %54 fotoğraf · alt %46 koyu panel (kırmızı başlık + açıklama)
 * Edge runtime — Vercel CDN cache'ler.
 */
export const runtime = 'edge'

import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'

const PROJECT_ID = 'nahaberapp'
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/news`

interface ArticleOGData {
  title: string
  categoryId: string
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
      categoryId:    f.categoryId?.stringValue    || 'gundem',
      spot:          f.spot?.stringValue          || f.summary?.stringValue || f.description?.stringValue || '',
      imageUrl:      f.imageUrl?.stringValue      || '',
      thumbnail:     f.thumbnail?.stringValue     || '',
      coverImageUrl: f.coverImageUrl?.stringValue || '',
      featuredImage: f.featuredImage?.stringValue || '',
      image:         f.image?.stringValue         || '',
    }
  } catch {
    return null
  }
}

function bestImage(a: ArticleOGData): string {
  return a.thumbnail || a.coverImageUrl || a.imageUrl || a.featuredImage || a.image || ''
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

// Bölüm yükseklikleri
const PHOTO_H = 580   // ~54%
const TEXT_H  = 500   // ~46%

// ── Handler ────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const article = await fetchArticle(id)

  if (!article || !article.title) {
    return new Response('Haber bulunamadı', { status: 404 })
  }

  const photo     = bestImage(article)
  const title     = truncate(article.title, 65)
  const spot      = truncate(article.spot || '', 135)
  const titleSize = title.length > 52 ? 40 : title.length > 36 ? 48 : 56

  return new ImageResponse(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (
      <div
        style={{
          width: 1080,
          height: 1080,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          overflow: 'hidden',
          position: 'relative',
          background: '#0a1628',
        }}
      >
        {/* ═══════════════════════════════════════════════════════════════
            ÜST BÖLÜM — Haber fotoğrafı
        ═══════════════════════════════════════════════════════════════ */}
        <div
          style={{
            width: 1080,
            height: PHOTO_H,
            position: 'relative',
            display: 'flex',
            overflow: 'hidden',
            flexShrink: 0,
            backgroundColor: '#0d1f3a',
          }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'flex',
              }}
            />
          ) : (
            /* Görselsiz fallback — markalı gradient */
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'linear-gradient(135deg, #1e3a5f 0%, #0d2b4e 60%, #071528 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Dekoratif ışıma */}
              <div
                style={{
                  position: 'absolute',
                  top: -120, right: -120,
                  width: 480, height: 480,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(249,115,22,0.22) 0%, transparent 65%)',
                  display: 'flex',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: -80, left: -80,
                  width: 360, height: 360,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 65%)',
                  display: 'flex',
                }}
              />
            </div>
          )}

          {/* ── ÜST SAĞ: ONYEDİTİVİ HABERLERİ rozeti ── */}
          <div
            style={{
              position: 'absolute',
              top: 38,
              right: 0,
              backgroundColor: '#dc2626',
              padding: '14px 30px 14px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              style={{
                color: 'white',
                fontWeight: 900,
                fontSize: 26,
                letterSpacing: 1,
                display: 'flex',
              }}
            >
              ONYEDİTİVİ
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.80)',
                fontWeight: 400,
                fontSize: 19,
                letterSpacing: 2,
                display: 'flex',
              }}
            >
              HABERLERİ
            </span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            ALT BÖLÜM — Koyu panel: başlık + açıklama + footer
        ═══════════════════════════════════════════════════════════════ */}
        <div
          style={{
            width: 1080,
            height: TEXT_H,
            backgroundColor: '#0a1628',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Dekoratif dalga — sağ alt */}
          <div
            style={{
              position: 'absolute',
              bottom: -100, right: -70,
              width: 380, height: 380,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(30,100,210,0.38) 0%, rgba(10,50,140,0.22) 50%, transparent 70%)',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 30, right: 50,
              width: 220, height: 220,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(56,189,248,0.28) 0%, transparent 68%)',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: -10, right: 210,
              width: 170, height: 170,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(99,179,237,0.20) 0%, transparent 68%)',
              display: 'flex',
            }}
          />

          {/* Kırmızı başlık şeridi */}
          <div
            style={{
              backgroundColor: '#dc2626',
              padding: '22px 44px',
              display: 'flex',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                color: 'white',
                fontSize: titleSize,
                fontWeight: 900,
                lineHeight: 1.22,
                display: 'flex',
              }}
            >
              {title}
            </span>
          </div>

          {/* Açıklama metni */}
          {spot ? (
            <div
              style={{
                padding: '26px 44px 0',
                display: 'flex',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  color: 'rgba(255,255,255,0.82)',
                  fontSize: 28,
                  lineHeight: 1.55,
                  display: 'flex',
                }}
              >
                {spot}
              </span>
            </div>
          ) : null}

          {/* Footer */}
          <div
            style={{
              position: 'absolute',
              bottom: 34,
              left: 44,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 32,
                height: 3,
                backgroundColor: '#dc2626',
                borderRadius: 2,
                display: 'flex',
              }}
            />
            <span
              style={{
                color: 'rgba(255,255,255,0.38)',
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: 3,
                display: 'flex',
              }}
            >
              DAHA FAZLASI İÇİN: WWW.NAHABER.COM
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    }
  )
}
