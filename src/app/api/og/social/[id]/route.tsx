/**
 * GET /api/og/social/[id]
 *
 * ONYEDİTİVİ — 1080×1080 Instagram & Facebook Post görseli (1:1)
 * Renk paleti: OnyediTivi laciveri (#0d2355) + NaHaber kırmızısı (#CC0000)
 *
 * Layout (~54/42 — feed okunabilirliği için metne biraz daha alan):
 *   ┌─────────────────────────┐
 *   │  [Logo badge sağ üst]   │
 *   │   HABER FOTOĞRAFI       │  ~54% (580px) — object-fit: cover
 *   │   (kenardan kenara)     │  üst bölümü doldurur
 *   ├─── nahaber.com ─────────┤  kırmızı bar + beyaz pill (48px)
 *   │   MANŞET (Playfair)     │
 *   │   özet (büyük, net)     │  ~42% — lacivert (452px)
 *   │   #hashtag              │
 *   └─────────────────────────┘
 *
 * Preview (Firestore olmadan):
 *   /api/og/social/sample?title=...&spot=...&image=https://...
 */
export const runtime = 'nodejs'

import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'
import { embedBestOgImage, isUsableImageUrl, normalizeAbsoluteImageUrl } from '@/lib/social/ogImageEmbed'
import { clampAtWordBoundary, clampCompleteHeadline, clampCompleteSentences } from '@/lib/social/feedCaption'

const PROJECT_ID = 'nahaberapp'
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/news`

/** Manşet — 1–2 tematik satır tercih; kelime ortasından kesilmez */
const TITLE_MAX = 72
/** Özet — tam cümleler, büyük punto; cümle/kelime ortasından kesilmez (CTA yok) */
const SPOT_MAX = 160

interface ArticleOGData {
  title: string
  spot: string
  socialHeadline: string
  socialStorySummary: string
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
    const res = await fetch(`${FIREBASE_URL}/${id}?key=${apiKey}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json() as { fields?: Record<string, { stringValue?: string }> }
    const f = data.fields
    if (!f) return null
    const str = (v?: { stringValue?: string }) => v?.stringValue?.trim() || ''
    return {
      title:              str(f.title),
      spot:               str(f.spot) || str(f.summary) || str(f.description),
      socialHeadline:     str(f.socialHeadline),
      socialStorySummary: str(f.socialStorySummary),
      imageUrl:           str(f.imageUrl),
      thumbnail:          str(f.thumbnail),
      coverImageUrl:      str(f.coverImageUrl),
      featuredImage:      str(f.featuredImage),
      image:              str(f.image),
    }
  } catch { return null }
}

function bestImageCandidates(a: ArticleOGData): string[] {
  return [a.thumbnail, a.coverImageUrl, a.imageUrl, a.featuredImage, a.image]
    .map((u) => normalizeAbsoluteImageUrl(u))
    .filter((u) => isUsableImageUrl(u))
}

/** Manşet: 1–3 tematik satır (\\n); toplam karakter limiti. */
function clampHeadline(s: string, max: number): string {
  const lines = s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)
  if (lines.length === 0) return ''
  if (lines.length === 1) return clampCompleteHeadline(lines[0], max)
  let used = 0
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const remain = max - used
    if (remain < 6) break
    const share = Math.max(8, Math.floor(remain / (lines.length - i)))
    const part = clampAtWordBoundary(lines[i], Math.min(share, remain))
    if (!part) continue
    out.push(part)
    used += part.length
  }
  return out.join('\n') || clampCompleteHeadline(lines.join(' '), max)
}

// Boyutlar — 1:1 kare (~54% foto / ~42% metin — Instagram feed okunabilirliği)
const W = 1080
const H = 1080
const PHOTO_H = 580   // ~54%
const MID_H   = 48    // kırmızı geçiş barı
const TITLE_H = H - PHOTO_H - MID_H  // 452px (~42%)
const TEXT_PAD_TOP = 36
const TEXT_PAD_SIDE = 42
const TEXT_PAD_BOTTOM = 28

// Renkler
const NAVY   = '#0d2355'   // OnyediTivi koyu lacivert
const RED    = '#CC0000'   // NaHaber kırmızısı
const BLUE   = '#2563b8'   // OnyediTivi orta mavi
const LBLUE  = '#62b8e8'   // OnyediTivi açık mavi (hashtag)

/** Manşet — gazete ciddiyeti (serif display) */
const FONT_HEADLINE = 'Playfair Display'
/** Özet / UI — okunaklı sans */
const FONT_BODY = 'Inter'

async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const cssUrl =
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`
    const css = await fetch(cssUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1',
      },
      cache: 'force-cache',
    }).then((r) => r.text())
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?(?:opentype|truetype)['"]?\)/i)
      || css.match(/src:\s*url\(([^)]+)\)/i)
    if (!match?.[1]) return null
    const res = await fetch(match[1], { cache: 'force-cache' })
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

type OgFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
type OgFont = { name: string; data: ArrayBuffer; weight: OgFontWeight; style: 'normal' }

async function loadPostFonts(): Promise<OgFont[]> {
  const specs: Array<{ name: string; weight: OgFontWeight }> = [
    { name: FONT_HEADLINE, weight: 700 },
    { name: FONT_HEADLINE, weight: 900 },
    { name: FONT_BODY, weight: 400 },
    { name: FONT_BODY, weight: 500 },
    { name: FONT_BODY, weight: 600 },
    { name: FONT_BODY, weight: 700 },
    { name: FONT_BODY, weight: 800 },
  ]
  const loaded = await Promise.all(
    specs.map(async (s) => {
      const data = await loadGoogleFont(s.name, s.weight)
      return data ? { name: s.name, data, weight: s.weight, style: 'normal' as const } : null
    })
  )
  return loaded.filter((f): f is OgFont => f !== null)
}

function fallbackImageResponse() {
  return new ImageResponse(
    <div style={{ width: W, height: H, display: 'flex', background: NAVY }}>
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 36, margin: 'auto', display: 'flex' }}>NaHaber</span>
    </div>,
    { width: W, height: H }
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const q = req.nextUrl.searchParams
  const overrideTitle = q.get('title')?.trim() || ''
  const overrideSpot  = q.get('spot')?.trim()  || ''
  const overrideImage = q.get('image')?.trim() || ''

  let article: ArticleOGData | null = null
  if (id !== 'sample' && id !== 'preview') {
    try { article = await fetchArticle(id) } catch { return fallbackImageResponse() }
  }

  const rawTitle =
    overrideTitle ||
    article?.socialHeadline ||
    article?.title ||
    ''
  if (!rawTitle) {
    if (id === 'sample' || id === 'preview') {
      return new Response('sample için ?title= (ve ?spot=) gerekli', { status: 400 })
    }
    return new Response('Haber bulunamadi', { status: 404 })
  }

  const rawSpot =
    overrideSpot ||
    article?.socialStorySummary ||
    article?.spot ||
    ''

  const photo = await embedBestOgImage(
    [overrideImage, ...(article ? bestImageCandidates(article) : [])],
    { maxWidth: 1080, maxHeight: 1080, quality: 84 },
  )

  const title = clampHeadline(rawTitle, TITLE_MAX)
  const spot  = rawSpot ? clampCompleteSentences(rawSpot, SPOT_MAX) : ''
  const titleLines = title.split('\n').filter(Boolean)
  const titlePlainLen = titleLines.join('').length

  // Alt ~42% metin bandı — güçlü Playfair manşet + yüksek kontrast özet (feed okunabilirliği)
  const titleSize =
    titleLines.length >= 3 ? (titlePlainLen > 55 ? 42 : 46) :
    titleLines.length === 2 ? (titlePlainLen > 52 ? 46 : titlePlainLen > 36 ? 50 : 54) :
    titlePlainLen > 58 ? 46 :
    titlePlainLen > 48 ? 50 :
    titlePlainLen > 36 ? 54 :
    titlePlainLen > 24 ? 58 :
    titlePlainLen > 16 ? 62 : 66
  const titleLineHeight = titleLines.length >= 2 ? 1.3 : 1.24

  const spotLen = spot.length
  const spotSize =
    spotLen > 140 ? 30 :
    spotLen > 100 ? 32 :
    spotLen > 70 ? 34 : 36
  const spotLineHeight = 1.52

  try {
    const fonts = await loadPostFonts()
    const hasHeadlineFont = fonts.some((f) => f.name === FONT_HEADLINE)
    const hasBodyFont = fonts.some((f) => f.name === FONT_BODY)
    const headlineFamily = hasHeadlineFont
      ? `"${FONT_HEADLINE}", "Times New Roman", Georgia, serif`
      : '"Times New Roman", Georgia, serif'
    const bodyFamily = hasBodyFont
      ? `"${FONT_BODY}", "Helvetica Neue", Helvetica, Arial, sans-serif`
      : '"Helvetica Neue", Helvetica, Arial, sans-serif'

    return new ImageResponse(
      <div style={{
        width: W, height: H, display: 'flex', flexDirection: 'column',
        fontFamily: bodyFamily,
        background: NAVY, overflow: 'hidden',
      }}>

        {/* ── FOTOĞRAF (~60%) ── */}
        <div style={{
          width: W, height: PHOTO_H,
          position: 'relative', display: 'flex', flexShrink: 0, overflow: 'hidden',
          background: NAVY,
        }}>
          {photo ? (
            <img src={photo} alt="" width={W} height={PHOTO_H}
              style={{
                width: W, height: PHOTO_H,
                objectFit: 'cover', objectPosition: 'center top',
                display: 'flex',
              }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', background: NAVY }} />
          )}

          {/* Alt gradient → lacivert */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 100,
            background: `linear-gradient(to top,${NAVY} 0%,rgba(13,35,85,0.5) 45%,transparent 100%)`,
            display: 'flex',
          }} />

          {/* OnyediTivi logo badge — sağ üst */}
          <div style={{
            position: 'absolute', top: 20, right: 20,
            display: 'flex', alignItems: 'center',
            background: 'rgba(13,35,85,0.9)', borderRadius: 12,
            padding: '9px 18px 9px 9px', gap: 10,
          }}>
            <div style={{ width: 44, height: 44, position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ position: 'absolute', width: 44, height: 40,
                background: '#8bbde0', borderRadius: '45% 55% 50% 50% / 50% 50% 55% 45%',
                display: 'flex' }} />
              <div style={{ position: 'absolute', width: 38, height: 38,
                background: BLUE, borderRadius: '38% 62% 55% 45% / 45% 55% 62% 38%',
                display: 'flex' }} />
              <div style={{ position: 'absolute', width: 32, height: 32,
                background: NAVY, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 0 }}>
                  <span style={{ color: '#ffffff', fontWeight: 900, fontSize: 15, lineHeight: 1, display: 'flex' }}>1</span>
                  <span style={{ color: LBLUE, fontWeight: 900, fontSize: 15, lineHeight: 1, display: 'flex' }}>7</span>
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#ffffff', fontWeight: 900, fontSize: 15, letterSpacing: 0.5, display: 'flex' }}>ONYEDiTiVi</span>
              <span style={{ color: LBLUE, fontWeight: 600, fontSize: 10, letterSpacing: 2.5, display: 'flex' }}>HABERLERi</span>
            </div>
          </div>
        </div>

        {/* ── GEÇİŞ SATIRI: tam kırmızı bar + nahaber.com pill ── */}
        <div style={{
          width: W, height: MID_H, flexShrink: 0,
          background: RED,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 32px', gap: 0,
        }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.28)', display: 'flex' }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#ffffff', borderRadius: 40,
            padding: '7px 20px',
            margin: '0 18px',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: RED, display: 'flex', flexShrink: 0 }} />
            <span style={{ color: RED, fontSize: 19, fontWeight: 800, letterSpacing: 0.2, display: 'flex' }}>nahaber.com</span>
          </div>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.28)', display: 'flex' }} />
        </div>

        {/* ── MANŞET + ÖZET ALANI (alt ~40%) ── */}
        <div style={{
          width: W, height: TITLE_H, flexShrink: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: `${TEXT_PAD_TOP}px ${TEXT_PAD_SIDE}px ${TEXT_PAD_BOTTOM}px`, background: NAVY,
        }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 16, flex: 1, overflow: 'hidden' }}>
            <div style={{
              width: 5, borderRadius: 3, background: RED, flexShrink: 0,
              alignSelf: 'stretch', display: 'flex', marginTop: 4, minHeight: 48,
            }} />
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 0,
              maxWidth: W - TEXT_PAD_SIDE * 2 - 24, flex: 1, overflow: 'hidden',
            }}>
              {/* Manşet — Playfair display; yüksek kontrast beyaz */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                maxHeight: Math.round(titleSize * titleLineHeight * 2.55),
                overflow: 'hidden',
              }}>
                {titleLines.map((line, i) => (
                  <span key={i} style={{
                    color: '#ffffff', fontFamily: headlineFamily, fontWeight: 900,
                    fontSize: titleSize, lineHeight: titleLineHeight, letterSpacing: 0.15,
                    display: 'flex',
                  }}>{line}</span>
                ))}
              </div>
              {/* Ayırıcı + özet — near-white, daha büyük punto */}
              {spot ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 20,
                  paddingTop: 30,
                }}>
                  <div style={{
                    width: 80, height: 2, borderRadius: 1,
                    background: 'rgba(255,255,255,0.32)', display: 'flex', flexShrink: 0,
                  }} />
                  <span style={{
                    color: '#ffffff', fontFamily: bodyFamily, fontWeight: 600,
                    fontSize: spotSize, lineHeight: spotLineHeight,
                    letterSpacing: 0.15, display: 'flex', flexDirection: 'column',
                  }}>{spot}</span>
                </div>
              ) : null}
            </div>
          </div>
          {/* Hashtags */}
          <span style={{
            color: LBLUE, fontFamily: bodyFamily, fontSize: 17,
            fontWeight: 600, letterSpacing: 1.1, display: 'flex',
            marginTop: 16,
          }}>#NaHaber  #Çanakkale  #SonDakika</span>
        </div>

      </div>,
      {
        width: W, height: H,
        ...(fonts.length > 0 ? { fonts } : {}),
        headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=300' },
      }
    )
  } catch {
    return fallbackImageResponse()
  }
}
