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

// Onyedi Tivi logosu — Satori destekli pure CSS (linear-gradient halka + "17")
function OnyediLogo({ size = 108 }: { size?: number }) {
  const ring = Math.round(size * 0.11)
  const inner = size - ring * 2
  const fontSize = Math.round(inner * 0.50)

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #f97316 0%, #e879f9 35%, #3b82f6 68%, #06b6d4 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: '50%',
          background: '#0a1628',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontSize,
            color: 'white',
            fontWeight: 800,
            letterSpacing: -1,
            lineHeight: 1,
            display: 'flex',
          }}
        >
          17
        </span>
      </div>
    </div>
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
  const catColor   = CAT_COLOR[article.categoryId] ?? '#ea580c'
  const catLabel   = CAT_LABEL[article.categoryId] ?? 'HABER'
  const title      = truncate(article.title, 72)
  const titleSize  = title.length > 55 ? 54 : title.length > 38 ? 64 : 76

  return new ImageResponse(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (
      // ══════════════════════════════════════════════════════════════════
      // KAPSAYICI — tam ekran, Onyedi Tivi Instagram teması
      // ══════════════════════════════════════════════════════════════════
      <div
        style={{
          width: 1080,
          height: 1080,
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: '#07111f',
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        }}
      >
        {/* ── TAM ARKA PLAN FOTOĞRAFI ── */}
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              display: 'flex',
            }}
          />
        ) : null}

        {/* ── MAVI OVERLAY TINT (Instagram teması) ── */}
        <div style={{
          position: 'absolute', inset: 0,
          background: photo
            ? 'linear-gradient(170deg, rgba(7,17,31,0.55) 0%, rgba(10,22,40,0.45) 40%, rgba(5,13,26,0.82) 100%)'
            : 'linear-gradient(160deg, #050d1a 0%, #0a1628 55%, #080f20 100%)',
          display: 'flex',
        }} />

        {/* ── ALT KARARTMA — metin okunabilirliği ── */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '58%',
          background: 'linear-gradient(to top, rgba(5,13,26,0.97) 0%, rgba(5,13,26,0.80) 45%, transparent 100%)',
          display: 'flex',
        }} />

        {/* ══════════════════════════════════════════════════════════════
            ÜST SOL — tivi 17 logo (Instagram teması: küçük, köşede)
        ══════════════════════════════════════════════════════════════ */}
        <div style={{
          position: 'absolute', top: 44, left: 48,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <OnyediLogo size={72} />
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 1,
          }}>
            <div style={{
              fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.90)',
              letterSpacing: 4, textTransform: 'uppercase',
              display: 'flex',
            }}>
              tivi
            </div>
            <div style={{
              fontSize: 13, color: 'rgba(255,255,255,0.45)',
              letterSpacing: 2, fontWeight: 400,
              display: 'flex',
            }}>
              nahaber.com
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            ALT BÖLÜM — kategori + başlık + kaynak
        ══════════════════════════════════════════════════════════════ */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex', flexDirection: 'column',
          padding: '0 56px 60px',
          gap: 20,
        }}>
          {/* Kategori badge — turuncu, Instagram tarzı */}
          <div style={{ display: 'flex' }}>
            <div style={{
              backgroundColor: catColor,
              color: 'white',
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: 4,
              padding: '10px 28px',
              display: 'flex',
            }}>
              {catLabel}
            </div>
          </div>

          {/* Başlık — büyük, kalın, beyaz */}
          <div style={{
            fontSize: titleSize,
            fontWeight: 900,
            color: '#ffffff',
            lineHeight: 1.18,
            letterSpacing: -1,
            display: 'flex',
          }}>
            {title}
          </div>

          {/* Kaynak */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 36, height: 3,
              backgroundColor: catColor,
              borderRadius: 2,
              display: 'flex',
            }} />
            <div style={{
              fontSize: 18,
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
    { width: 1080, height: 1080, headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }
  )
}
