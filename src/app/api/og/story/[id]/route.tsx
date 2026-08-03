/**
 * GET /api/og/story/[id]
 *
 * ONYEDİTİVİ — 1080×1920 Instagram & Facebook Hikaye görseli (9:16)
 * Renk paleti: OnyediTivi laciveri (#0d2355) + NaHaber kırmızısı (#CC0000)
 *
 * Layout (foto biraz daha uzun; manşet↔özet ince ayraç):
 *   ┌─────────────────────────┐
 *   │  [Logo badge sağ üst]   │
 *   │                         │
 *   │   HABER FOTOĞRAFI       │  ~58% (1120px)
 *   │                         │
 *   │  [🔗 nahaber.com pill]  │  alt kısım — link stikeri görseli
 *   ├─── nahaber.com ─────────┤  tam kırmızı bar + beyaz pill (80px)
 *   │   MANŞET (Playfair)     │
 *   │   ── ayraç ──           │
 *   │   spot/özet (büyük)     │  ~38% — lacivert bg (720px)
 *   │   #hashtag              │
 *   └─────────────────────────┘
 *
 * Örnek (Firestore olmadan):
 *   /api/og/story/sample?title=...&spot=...&image=https://...
 */
export const runtime = 'nodejs'

import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'
import { embedBestOgImage, isUsableImageUrl, normalizeAbsoluteImageUrl } from '@/lib/social/ogImageEmbed'
import { clampAtWordBoundary, clampCompleteHeadline, clampCompleteSentences } from '@/lib/social/feedCaption'

const PROJECT_ID = 'nahaberapp'
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/news`

/** Manşet — tam anlam; softMax ile yarım sıfat kesimini önle */
const TITLE_MAX = 78
/** Özet — 1–2 kısa cümle, büyük punto; cümle/kelime ortasından kesilmez */
const SPOT_MAX = 200

interface ArticleData {
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

async function fetchArticle(id: string): Promise<ArticleData | null> {
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
      title:               str(f.title),
      spot:                str(f.spot) || str(f.summary) || str(f.description),
      socialHeadline:      str(f.socialHeadline),
      socialStorySummary:  str(f.socialStorySummary),
      imageUrl:            str(f.imageUrl),
      thumbnail:           str(f.thumbnail),
      coverImageUrl:       str(f.coverImageUrl),
      featuredImage:       str(f.featuredImage),
      image:               str(f.image),
    }
  } catch { return null }
}

function bestImageCandidates(a: ArticleData): string[] {
  return [a.thumbnail, a.coverImageUrl, a.imageUrl, a.featuredImage, a.image]
    .map((u) => normalizeAbsoluteImageUrl(u))
    .filter((u) => isUsableImageUrl(u))
}

/** Manşet: 1–3 tematik satır (\\n); toplam karakter + softMax. */
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

// Boyutlar — 9:16 hikaye (foto ~58% / metin ~38% — bar biraz aşağı)
const W = 1080
const H = 1920
/** Fotoğraf — kırmızı bar + metin bandı biraz daha aşağı */
const PHOTO_H = 1120  // ~%58
const MID_H   = 80    // kırmızı geçiş barı
const TITLE_H = H - PHOTO_H - MID_H  // 720px (~%38)
/** Metin paneli — cömert padding; hashtag ezilmesin */
const TEXT_PAD_TOP = 52
const TEXT_PAD_SIDE = 48
const TEXT_PAD_BOTTOM = 44

// Renkler
const NAVY   = '#0d2355'   // OnyediTivi koyu lacivert
const RED    = '#CC0000'   // NaHaber kırmızısı
const BLUE   = '#2563b8'   // OnyediTivi orta mavi
const LBLUE  = '#62b8e8'   // OnyediTivi açık mavi

/** Manşet — gazete ciddiyeti (serif display) */
const FONT_HEADLINE = 'Playfair Display'
/** Özet / UI — okunaklı sans (klasik gazete: serif manşet + sans deck) */
const FONT_BODY = 'Inter'

/**
 * Google Fonts CSS → TTF/OTF ArrayBuffer (Satori / next/og).
 * Safari UA ile truetype döner; woff2 Satori'de sorun çıkarabilir.
 */
async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const cssUrl =
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`
    const css = await fetch(cssUrl, {
      headers: {
        // Eski Safari → truetype/opentype URL'leri
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

async function loadStoryFonts(): Promise<OgFont[]> {
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

function fallback() {
  return new ImageResponse(
    <div style={{ width: W, height: H, display: 'flex', background: NAVY }}>
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 40, margin: 'auto', display: 'flex' }}>NaHaber</span>
    </div>,
    { width: W, height: H }
  )
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const q = req.nextUrl.searchParams
  const overrideTitle = q.get('title')?.trim() || ''
  const overrideSpot  = q.get('spot')?.trim()  || ''
  const overrideImage = q.get('image')?.trim() || ''

  let article: ArticleData | null = null
  if (id !== 'sample' && id !== 'preview') {
    try { article = await fetchArticle(id) } catch { return fallback() }
  }

  const rawTitle =
    overrideTitle ||
    article?.socialHeadline ||
    article?.title ||
    ''
  if (!rawTitle) {
    if (id === 'sample' || id === 'preview') {
      return new Response('sample için ?title= ve ?spot= gerekli', { status: 400 })
    }
    return new Response('Haber bulunamadi', { status: 404 })
  }

  const rawSpot =
    overrideSpot ||
    article?.socialStorySummary ||
    article?.spot ||
    ''

  const candidates = [
    overrideImage,
    ...(article ? bestImageCandidates(article) : []),
  ]
  // next/og WebP/hotlink'i yutuyor — JPEG data URI'ye çevir
  const photo = await embedBestOgImage(candidates, {
    maxWidth: 1080,
    maxHeight: 1200,
    quality: 84,
  })

  const title = clampHeadline(rawTitle, TITLE_MAX)
  const spot  = rawSpot ? clampCompleteSentences(rawSpot, SPOT_MAX) : ''
  const titleLines = title.split('\n').filter(Boolean)
  const titlePlainLen = titleLines.join('').length

  // Manşet — mobil hikayede rahat okunur Playfair; 1–3 satır, yüksek satır arası
  const titleSize =
    titleLines.length >= 3 ? 56 :
    titleLines.length === 2 ? (titlePlainLen > 44 ? 58 : titlePlainLen > 32 ? 62 : 66) :
    titlePlainLen > 58 ? 54 :
    titlePlainLen > 44 ? 60 :
    titlePlainLen > 28 ? 68 :
    titlePlainLen > 16 ? 76 : 84
  const titleLineHeight = titleLines.length >= 2 ? 1.24 : 1.18

  // Özet — punto korundu; yüksek kontrast
  const spotLen = spot.length
  const spotSize =
    spotLen > 140 ? 36 :
    spotLen > 100 ? 38 :
    spotLen > 60 ? 40 : 42
  const spotLineHeight = 1.52

  try {
    const fonts = await loadStoryFonts()
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

        {/* ── FOTOĞRAF (~58%) ── */}
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
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 320,
            background: `linear-gradient(to top,${NAVY} 0%,rgba(13,35,85,0.55) 45%,transparent 100%)`,
            display: 'flex',
          }} />

          {/* OnyediTivi logo badge — sağ üst */}
          <div style={{
            position: 'absolute', top: 40, right: 40,
            display: 'flex', alignItems: 'center',
            background: 'rgba(13,35,85,0.88)', borderRadius: 14,
            padding: '12px 24px 12px 12px', gap: 14,
          }}>
            <div style={{ width: 64, height: 64, position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ position: 'absolute', width: 64, height: 58,
                background: '#8bbde0', borderRadius: '45% 55% 50% 50% / 50% 50% 55% 45%',
                display: 'flex' }} />
              <div style={{ position: 'absolute', width: 56, height: 56,
                background: BLUE, borderRadius: '38% 62% 55% 45% / 45% 55% 62% 38%',
                display: 'flex' }} />
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

          {/* Bağlantı pill — fotoğraf alt kısmı (bar'a yaklaştırıldı) */}
          <div style={{
            position: 'absolute', bottom: 36, left: '50%', marginLeft: -220,
            display: 'flex', alignItems: 'center', gap: 18,
            background: 'rgba(255,255,255,0.18)',
            border: '2px solid rgba(255,255,255,0.4)',
            borderRadius: 80, padding: '18px 48px',
          }}>
            {/* zincir ikonu — iki oval */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <div style={{ width: 20, height: 12, borderRadius: 6, border: '3px solid rgba(255,255,255,0.85)', display: 'flex' }} />
              <div style={{ width: 14, height: 2, background: 'rgba(255,255,255,0.85)', display: 'flex' }} />
              <div style={{ width: 20, height: 12, borderRadius: 6, border: '3px solid rgba(255,255,255,0.85)', display: 'flex' }} />
            </div>
            <span style={{ color: '#ffffff', fontSize: 28, fontWeight: 700, letterSpacing: 0.3, display: 'flex' }}>
              nahaber.com&apos;u oku
            </span>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 32, display: 'flex' }}>↑</span>
          </div>
        </div>

        {/* ── GEÇİŞ BARI — tam kırmızı + beyaz pill ── */}
        <div style={{
          width: W, height: MID_H, flexShrink: 0,
          background: RED,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 44px',
        }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.25)', display: 'flex' }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#ffffff', borderRadius: 50,
            padding: '10px 32px', margin: '0 24px',
          }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: RED, display: 'flex', flexShrink: 0 }} />
            <span style={{ color: RED, fontSize: 28, fontWeight: 800, letterSpacing: 0.3, display: 'flex' }}>nahaber.com</span>
          </div>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.25)', display: 'flex' }} />
        </div>

        {/* ── BAŞLIK + SPOT ALANI (~38%) ── */}
        <div style={{
          width: W, height: TITLE_H, flexShrink: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: `${TEXT_PAD_TOP}px ${TEXT_PAD_SIDE}px ${TEXT_PAD_BOTTOM}px`, background: NAVY,
        }}>
          {/* Manşet + ayraç + özet — sol kırmızı çizgi */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 24, flex: 1, overflow: 'hidden' }}>
            <div style={{
              width: 8, borderRadius: 4, background: RED, flexShrink: 0,
              alignSelf: 'stretch', display: 'flex', marginTop: 8, minHeight: 64,
            }} />
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 0,
              maxWidth: W - TEXT_PAD_SIDE * 2 - 32, flex: 1, overflow: 'hidden',
            }}>
              {/* Manşet — büyük Playfair, yüksek kontrast (punto sabit) */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                maxHeight: Math.round(titleSize * titleLineHeight * 3.2),
                overflow: 'hidden',
              }}>
                {titleLines.map((line, i) => (
                  <span key={i} style={{
                    color: '#ffffff', fontFamily: headlineFamily, fontWeight: 900,
                    fontSize: titleSize, lineHeight: titleLineHeight, letterSpacing: -0.3,
                    display: 'flex',
                  }}>{line}</span>
                ))}
              </div>
              {/* Manşet ↔ özet ayraç: kısa kırmızı + ince beyaz hairline */}
              {spot ? (
                <div style={{
                  display: 'flex', flexDirection: 'row', alignItems: 'center',
                  gap: 12, width: '100%', marginTop: 26, marginBottom: 0,
                }}>
                  <div style={{
                    width: 40, height: 2, borderRadius: 1, background: RED,
                    display: 'flex', flexShrink: 0,
                  }} />
                  <div style={{
                    width: 900, height: 2, borderRadius: 1,
                    background: 'rgba(255,255,255,0.38)',
                    display: 'flex', flexShrink: 0,
                  }} />
                </div>
              ) : null}
              {/* Özet — punto sabit; ayraçtan 22px boşluk */}
              {spot ? (
                <span style={{
                  color: 'rgba(255,255,255,0.96)', fontFamily: bodyFamily, fontWeight: 500,
                  fontSize: spotSize, lineHeight: spotLineHeight, display: 'flex', flexDirection: 'column',
                  paddingTop: 22,
                }}>{spot}</span>
              ) : null}
            </div>
          </div>
          {/* Hashtags — metinden ayrı, ezilmesin */}
          <span style={{
            color: LBLUE, fontFamily: bodyFamily, fontSize: 28, fontWeight: 600,
            letterSpacing: 1.5, display: 'flex', marginTop: 28, flexShrink: 0,
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
    return fallback()
  }
}
