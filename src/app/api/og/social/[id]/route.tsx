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

// Onyedi Tivi logosu — base64 PNG (216×216, gradient ring + dark inner + "17")
// Satori Edge runtime dış URL fetch edemez; data URI kullanıyoruz.
const LOGO_B64 = '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'

function OnyediLogo({ size = 108 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:image/png;base64,${LOGO_B64}`}
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
