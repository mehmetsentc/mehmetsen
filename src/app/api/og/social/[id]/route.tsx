/**
 * GET /api/og/social/[id]
 *
 * Onyedi Tivi marka stilinde 1080×1080 sosyal medya görseli.
 * Edge runtime — Vercel CDN 24 saat cache'ler.
 */
export const runtime = 'edge'

import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'

const PROJECT_ID = 'nahaberapp'
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/news`

interface ArticleOGData {
  title: string
  categoryId: string
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
      title:         f.title?.stringValue          || '',
      categoryId:    f.categoryId?.stringValue     || 'gundem',
      imageUrl:      f.imageUrl?.stringValue       || '',
      thumbnail:     f.thumbnail?.stringValue      || '',
      coverImageUrl: f.coverImageUrl?.stringValue  || '',
      featuredImage: f.featuredImage?.stringValue  || '',
      image:         f.image?.stringValue          || '',
    }
  } catch {
    return null
  }
}

function bestImage(a: ArticleOGData): string {
  return a.thumbnail || a.coverImageUrl || a.imageUrl || a.featuredImage || a.image || ''
}

// ── Kategori renkleri (Onyedi Tivi palette) ─────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  gundem:        '#dc2626',
  siyaset:       '#7c3aed',
  spor:          '#16a34a',
  futbol:        '#15803d',
  basketbol:     '#166534',
  voleybol:      '#14532d',
  hentbol:       '#14532d',
  atletizm:      '#166534',
  gures:         '#15803d',
  ekonomi:       '#c2410c',
  teknoloji:     '#1d4ed8',
  kultur:        '#7c3aed',
  sinema:        '#6d28d9',
  tiyatro:       '#5b21b6',
  konser:        '#6d28d9',
  festival:      '#4c1d95',
  magazin:       '#be185d',
  'yerel-haber': '#0369a1',
  dunya:         '#334155',
  gastronomi:    '#c2410c',
  otomobil:      '#334155',
  saglik:        '#dc2626',
  bilim:         '#0d9488',
  trend:         '#c2410c',
}

const CAT_LABEL: Record<string, string> = {
  gundem:        'GÜNDEM',
  siyaset:       'SİYASET',
  spor:          'SPOR',
  futbol:        'FUTBOL',
  basketbol:     'BASKETBOL',
  voleybol:      'VOLEYBOL',
  hentbol:       'HENTBOL',
  atletizm:      'ATLETİZM',
  gures:         'GÜREŞ',
  ekonomi:       'EKONOMİ',
  teknoloji:     'TEKNOLOJİ',
  kultur:        'KÜLTÜR',
  sinema:        'SİNEMA',
  tiyatro:       'TİYATRO',
  konser:        'KONSER',
  festival:      'FESTİVAL',
  magazin:       'MAGAZİN',
  'yerel-haber': 'YEREL HABER',
  dunya:         'DÜNYA',
  gastronomi:    'GASTRONOMİ',
  otomobil:      'OTOMOBİL',
  saglik:        'SAĞLIK',
  bilim:         'BİLİM',
  trend:         'TREND',
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

// Onyedi Tivi logosu: /public/brand/onyeditivi-ring.png olarak hazırlandı.
// Bu sabit boyutlu bileşen sadece img wrapper döndürür.
function OnyediLogo({ size = 108 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="https://nahaber.com/brand/onyeditivi-ring.png"
      width={size}
      height={size}
      alt="Onyedi Tivi"
      style={{ display: 'flex', flexShrink: 0 }}
    />
  )
}

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

  const photo      = bestImage(article)
  const catColor   = CAT_COLOR[article.categoryId] ?? '#dc2626'
  const catLabel   = CAT_LABEL[article.categoryId] ?? 'HABER'
  const title      = truncate(article.title, 88)
  const titleSize  = title.length > 65 ? 50 : title.length > 45 ? 58 : 66

  return new ImageResponse(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (
      // ══════════════════════════════════════════════════════════════════
      // KAPSAYICI — lacivert gradient arka plan
      // ══════════════════════════════════════════════════════════════════
      <div
        style={{
          width: 1080,
          height: 1080,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(160deg, #050d1a 0%, #0a1628 55%, #080f20 100%)',
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* ── Arka plan ışıma efektleri ── */}
        <div style={{
          position: 'absolute', top: -300, right: -300,
          width: 700, height: 700, borderRadius: '50%',
          background: `radial-gradient(circle, ${catColor}12 0%, transparent 65%)`,
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: -200, left: -200,
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, #1e40af0e 0%, transparent 65%)',
          display: 'flex',
        }} />

        {/* ══════════════════════════════════════════════════════════════
            ÜST BAR — logo + marka
        ══════════════════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '36px 52px 28px',
          flexShrink: 0,
        }}>
          {/* Sol: Onyedi Tivi logosu (gradient halka + 17) */}
          <OnyediLogo size={108} />

          {/* Sağ: ONYEDİ TİVİ marka metni */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{
              fontSize: 30, fontWeight: 900, color: 'white',
              letterSpacing: 6, textTransform: 'uppercase',
              display: 'flex',
            }}>
              ONYEDİ TİVİ
            </div>
            <div style={{
              fontSize: 17, color: 'rgba(255,255,255,0.45)',
              letterSpacing: 3, fontWeight: 400,
              display: 'flex',
            }}>
              nahaber.com
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            KATEGORİ ETİKETİ — tam genişlik çubuk
        ══════════════════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginLeft: 52,
          marginRight: 52,
          flexShrink: 0,
          gap: 0,
        }}>
          <div style={{
            backgroundColor: catColor,
            color: 'white',
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: 5,
            padding: '12px 32px',
            display: 'flex',
          }}>
            {catLabel}
          </div>
          {/* Sağa uzayan çizgi */}
          <div style={{
            flex: 1,
            height: 52,
            backgroundColor: `${catColor}22`,
            borderTop: `2px solid ${catColor}55`,
            display: 'flex',
          }} />
        </div>

        {/* ══════════════════════════════════════════════════════════════
            FOTOĞRAF ALANI
        ══════════════════════════════════════════════════════════════ */}
        <div style={{
          flex: 1,
          display: 'flex',
          margin: '20px 52px 20px',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {photo ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: 0.90,
                }}
              />
              {/* Hafif alt karartma */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
                background: 'linear-gradient(to top, rgba(5,13,26,0.6) 0%, transparent 100%)',
                display: 'flex',
              }} />
            </>
          ) : (
            /* Fotoğraf yoksa: Onyedi Tivi gradientli yer tutucu */
            <div style={{
              flex: 1,
              background: `linear-gradient(135deg, ${catColor}20 0%, #1e3a8a20 50%, ${catColor}15 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                fontSize: 160, fontWeight: 900,
                color: `${catColor}15`,
                display: 'flex',
                letterSpacing: -10,
              }}>17</div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            BAŞLIK + KAYNAK
        ══════════════════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 52px 48px',
          gap: 16,
          flexShrink: 0,
        }}>
          {/* Başlık */}
          <div style={{
            fontSize: titleSize,
            fontWeight: 900,
            color: '#ffffff',
            lineHeight: 1.2,
            letterSpacing: -0.5,
            display: 'flex',
          }}>
            {title}
          </div>

          {/* Ayırıcı çizgi + kaynak */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            <div style={{
              width: 40, height: 3,
              backgroundColor: catColor,
              borderRadius: 2,
              display: 'flex',
            }} />
            <div style={{
              fontSize: 19,
              color: 'rgba(255,255,255,0.35)',
              fontWeight: 600,
              letterSpacing: 4,
              display: 'flex',
            }}>
              ÇANAKKALE · ONYEDİ TİVİ
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080, headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }
  )
}
