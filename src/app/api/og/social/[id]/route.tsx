/**
 * GET /api/og/social/[id]
 *
 * Onyedi Tivi marka stilinde 1080×1080 sosyal medya görseli üretir.
 * Edge runtime — Vercel CDN tarafından 24 saat cache'lenir.
 *
 * Kullanım: https://nahaber.com/api/og/social/{articleId}
 */
export const runtime = 'edge'

import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'

// Firestore REST (Edge runtime'da firebase-admin çalışmaz)
const PROJECT_ID = 'nahaberapp'
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/news`

interface ArticleOGData {
  title: string
  categoryId: string
  imageUrl: string
  summary?: string
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
      title:      f.title?.stringValue     || '',
      categoryId: f.categoryId?.stringValue || 'gundem',
      imageUrl:   f.imageUrl?.stringValue   || '',
      summary:    f.summary?.stringValue    || '',
    }
  } catch {
    return null
  }
}

// ── Brand palette ──────────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  gundem:       '#e11d48',
  siyaset:      '#7c3aed',
  spor:         '#16a34a',
  futbol:       '#15803d',
  basketbol:    '#166534',
  voleybol:     '#14532d',
  hentbol:      '#14532d',
  atletizm:     '#166534',
  gures:        '#15803d',
  ekonomi:      '#d97706',
  teknoloji:    '#2563eb',
  kultur:       '#7c3aed',
  sinema:       '#6d28d9',
  tiyatro:      '#5b21b6',
  konser:       '#6d28d9',
  festival:     '#4c1d95',
  magazin:      '#be185d',
  'yerel-haber':'#059669',
  dunya:        '#475569',
  gastronomi:   '#ea580c',
  otomobil:     '#475569',
  saglik:       '#e11d48',
  bilim:        '#0d9488',
  trend:        '#d97706',
}

const CAT_LABEL: Record<string, string> = {
  gundem:       'GÜNDEM',
  siyaset:      'SİYASET',
  spor:         'SPOR',
  futbol:       'FUTBOL',
  basketbol:    'BASKETBOL',
  voleybol:     'VOLEYBOL',
  hentbol:      'HENTBOL',
  atletizm:     'ATLETİZM',
  gures:        'GÜREŞ',
  ekonomi:      'EKONOMİ',
  teknoloji:    'TEKNOLOJİ',
  kultur:       'KÜLTÜR',
  sinema:       'SİNEMA',
  tiyatro:      'TİYATRO',
  konser:       'KONSER',
  festival:     'FESTİVAL',
  magazin:      'MAGAZİN',
  'yerel-haber':'YEREL',
  dunya:        'DÜNYA',
  gastronomi:   'GASTRONOMİ',
  otomobil:     'OTOMOBİL',
  saglik:       'SAĞLIK',
  bilim:        'BİLİM',
  trend:        'TREND',
}

// ── Helpers ────────────────────────────────────────────────────────────────
function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
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

  const { title, categoryId, imageUrl } = article
  const catColor = CAT_COLOR[categoryId] ?? '#2563eb'
  const catLabel = CAT_LABEL[categoryId] ?? 'HABER'
  const displayTitle = truncate(title, 95)

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1080,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#070c18',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        }}
      >
        {/* ── Background image ── */}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            width={1080}
            height={1080}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.5,
            }}
          />
        ) : (
          /* Fallback: subtle geometric pattern background */
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(ellipse at 30% 30%, ${catColor}22 0%, transparent 60%),
                           radial-gradient(ellipse at 70% 70%, #1e40af22 0%, transparent 60%)`,
              display: 'flex',
            }}
          />
        )}

        {/* ── Top gradient scrim ── */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 280,
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
            display: 'flex',
          }}
        />

        {/* ── Bottom gradient scrim ── */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 600,
            background:
              'linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.88) 40%, rgba(0,0,0,0) 100%)',
            display: 'flex',
          }}
        />

        {/* ── Top bar ── */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '44px 52px',
            zIndex: 10,
          }}
        >
          {/* Onyedi Tivi Logo — katmanlı mavi rozet */}
          <div style={{ width: 100, height: 100, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Arka katman 1 — açık mavi organik şekil */}
            <svg width="100" height="100" viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0 }}>
              <path d="M50 5 C65 3, 80 12, 88 25 C96 38, 97 55, 90 68 C83 81, 68 90, 53 92 C38 94, 22 87, 14 75 C6 63, 5 46, 12 33 C19 20, 35 7, 50 5Z" fill="#60a5fa" opacity="0.7"/>
            </svg>
            {/* Orta katman — orta mavi */}
            <svg width="100" height="100" viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0 }}>
              <path d="M50 10 C62 8, 76 16, 83 28 C90 40, 91 56, 85 68 C79 80, 65 88, 51 89 C37 90, 22 83, 16 72 C10 61, 10 45, 16 34 C22 23, 38 12, 50 10Z" fill="#2563eb" opacity="0.85"/>
            </svg>
            {/* Merkez daire — lacivert */}
            <svg width="100" height="100" viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0 }}>
              <circle cx="50" cy="50" r="34" fill="#1e3a8a"/>
            </svg>
            {/* "1" beyaz, "7" açık mavi */}
            <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
              <span style={{ fontSize: 38, fontWeight: 900, color: 'white', lineHeight: 1, letterSpacing: -3 }}>1</span>
              <span style={{ fontSize: 38, fontWeight: 900, color: '#7dd3fc', lineHeight: 1, letterSpacing: -3 }}>7</span>
            </div>
          </div>

          {/* ONYEDİ TİVİ wordmark */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 2,
            }}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: 'white',
                letterSpacing: 5,
                textTransform: 'uppercase',
              }}
            >
              ONYEDİ TİVİ
            </div>
            <div
              style={{
                fontSize: 18,
                color: 'rgba(255,255,255,0.5)',
                letterSpacing: 3,
                fontWeight: 500,
              }}
            >
              nahaber.com
            </div>
          </div>
        </div>

        {/* ── Category badge (mid-left) ── */}
        <div
          style={{
            position: 'absolute',
            left: 52,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            display: 'flex',
          }}
        >
          <div
            style={{
              backgroundColor: catColor,
              color: 'white',
              padding: '10px 26px',
              borderRadius: 8,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 4,
              boxShadow: `0 4px 20px ${catColor}80`,
            }}
          >
            {catLabel}
          </div>
        </div>

        {/* ── Bottom content: headline + source ── */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '0 52px 56px',
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            zIndex: 10,
          }}
        >
          {/* Accent line */}
          <div
            style={{
              width: 80,
              height: 5,
              backgroundColor: catColor,
              borderRadius: 4,
              display: 'flex',
              boxShadow: `0 2px 12px ${catColor}`,
            }}
          />

          {/* Headline */}
          <div
            style={{
              fontSize: displayTitle.length > 60 ? 50 : 58,
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.22,
              letterSpacing: -0.5,
              textShadow: '0 2px 16px rgba(0,0,0,0.9)',
            }}
          >
            {displayTitle}
          </div>

          {/* Source row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 3,
                height: 22,
                backgroundColor: catColor,
                borderRadius: 2,
                display: 'flex',
              }}
            />
            <div
              style={{
                fontSize: 22,
                color: 'rgba(255,255,255,0.45)',
                fontWeight: 600,
                letterSpacing: 3,
              }}
            >
              ÇANAKKALE · ONYEDİ TİVİ
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  )
}
