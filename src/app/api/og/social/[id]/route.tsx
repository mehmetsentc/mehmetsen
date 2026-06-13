/**
 * GET /api/og/social/[id]
 *
 * Onyedi Tivi marka stilinde 1080×1080 sosyal medya görseli üretir.
 * Edge runtime — Vercel CDN tarafından 24 saat cache'lenir.
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

// ── Brand palette ──────────────────────────────────────────────────────────
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
  ekonomi:       '#d97706',
  teknoloji:     '#2563eb',
  kultur:        '#7c3aed',
  sinema:        '#6d28d9',
  tiyatro:       '#5b21b6',
  konser:        '#6d28d9',
  festival:      '#4c1d95',
  magazin:       '#be185d',
  'yerel-haber': '#059669',
  dunya:         '#475569',
  gastronomi:    '#ea580c',
  otomobil:      '#334155',
  saglik:        '#dc2626',
  bilim:         '#0d9488',
  trend:         '#d97706',
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const article = await fetchArticle(id)

  if (!article || !article.title) {
    return new Response('Haber bulunamadı', { status: 404 })
  }

  const photo       = bestImage(article)
  const catColor    = CAT_COLOR[article.categoryId] ?? '#dc2626'
  const catLabel    = CAT_LABEL[article.categoryId] ?? 'HABER'
  const displayTitle = truncate(article.title, 90)
  const titleSize   = displayTitle.length > 65 ? 52 : displayTitle.length > 45 ? 60 : 68

  return new ImageResponse(
    (
      // ── Kapsayıcı: 1080×1080, lacivert arka plan ──────────────────────
      <div
        style={{
          width: 1080,
          height: 1080,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(160deg, #0b1526 0%, #111d35 50%, #0a1220 100%)',
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* ── Dekoratif arka plan ışıması ── */}
        <div style={{
          position: 'absolute', top: -200, right: -200,
          width: 600, height: 600, borderRadius: '50%',
          background: `radial-gradient(circle, ${catColor}18 0%, transparent 70%)`,
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: -150, left: -150,
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, #1e3a8a18 0%, transparent 70%)',
          display: 'flex',
        }} />

        {/* ══════════════════════════════════════════════════════════════
            ÜST BAR — kategori rengi + logo
        ══════════════════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: catColor,
          paddingLeft: 48,
          paddingRight: 48,
          height: 110,
          flexShrink: 0,
        }}>
          {/* Sol: 17 Logo */}
          <div style={{
            width: 72, height: 72,
            borderRadius: '50%',
            backgroundColor: 'rgba(0,0,0,0.30)',
            border: '3px solid rgba(255,255,255,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: 'white', letterSpacing: -2 }}>1</span>
            <span style={{ fontSize: 30, fontWeight: 900, color: 'rgba(255,255,255,0.75)', letterSpacing: -2 }}>7</span>
          </div>

          {/* Ortada: Kategori etiketi */}
          <div style={{
            fontSize: 38,
            fontWeight: 900,
            color: 'white',
            letterSpacing: 6,
            textShadow: '0 2px 8px rgba(0,0,0,0.3)',
            display: 'flex',
          }}>
            {catLabel}
          </div>

          {/* Sağ: ONYEDİ TİVİ */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'white', letterSpacing: 3 }}>ONYEDİ TİVİ</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', letterSpacing: 2 }}>nahaber.com</div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            FOTOĞRAF ALANI — kart stili
        ══════════════════════════════════════════════════════════════ */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 48px 24px',
          position: 'relative',
        }}>
          {photo ? (
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: 16,
              overflow: 'hidden',
              display: 'flex',
              position: 'relative',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: 0.92,
                }}
              />
              {/* İnce karartma — alt kenar için */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%',
                background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)',
                display: 'flex',
              }} />
            </div>
          ) : (
            /* Fotoğraf yoksa: renkli gradient yer tutucu */
            <div style={{
              width: '100%', height: '100%', borderRadius: 16,
              background: `linear-gradient(135deg, ${catColor}33 0%, #1e3a8a33 50%, ${catColor}22 100%)`,
              border: `2px solid ${catColor}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                fontSize: 120, fontWeight: 900, color: `${catColor}30`,
                display: 'flex',
              }}>17</div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            ALT KISIM — başlık + kaynak
        ══════════════════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '0 48px 48px',
          gap: 18,
          flexShrink: 0,
        }}>
          {/* Renkli yatay çizgi */}
          <div style={{
            height: 5,
            width: '100%',
            background: `linear-gradient(to right, ${catColor}, ${catColor}40)`,
            borderRadius: 4,
            display: 'flex',
          }} />

          {/* Başlık */}
          <div style={{
            fontSize: titleSize,
            fontWeight: 900,
            color: '#ffffff',
            lineHeight: 1.18,
            letterSpacing: -0.5,
            display: 'flex',
          }}>
            {displayTitle}
          </div>

          {/* Kaynak satırı */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}>
            <div style={{
              width: 4, height: 20,
              backgroundColor: catColor,
              borderRadius: 2,
              display: 'flex',
            }} />
            <div style={{
              fontSize: 20,
              color: 'rgba(255,255,255,0.40)',
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
    { width: 1080, height: 1080 }
  )
}
