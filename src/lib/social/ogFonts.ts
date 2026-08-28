import { readFileSync, existsSync } from 'fs'
import path from 'path'

export type OgFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
export type OgFont = { name: string; data: ArrayBuffer; weight: OgFontWeight; style: 'normal' }

let cachedFonts: OgFont[] | null = null

const FONT_FILES: Array<{ weight: OgFontWeight; filename: string }> = [
  { weight: 400, filename: 'Inter-Regular.ttf' },
  { weight: 500, filename: 'Inter-Medium.ttf' },
  { weight: 600, filename: 'Inter-SemiBold.ttf' },
  { weight: 700, filename: 'Inter-Bold.ttf' },
  { weight: 800, filename: 'Inter-ExtraBold.ttf' },
  { weight: 900, filename: 'Inter-Black.ttf' },
]

/**
 * Bundled Inter font loader with full Turkish character support (latin-ext).
 * Reads directly from local filesystem (src/assets/fonts or public/fonts).
 * Completely offline and deterministic: zero network calls, zero rate-limit or timeout risk,
 * completely eliminating missing glyph tofu boxes (□□□□).
 */
export function getBundledOgFontsSync(): OgFont[] {
  if (cachedFonts && cachedFonts.length > 0) {
    return cachedFonts
  }

  const fonts: OgFont[] = []
  for (const { weight, filename } of FONT_FILES) {
    const candidatePaths = [
      path.join(process.cwd(), 'src/assets/fonts', filename),
      path.join(process.cwd(), 'public/fonts', filename),
      path.join(__dirname, '../../assets/fonts', filename),
      path.join(__dirname, '../../../public/fonts', filename),
    ]

    for (const p of candidatePaths) {
      if (existsSync(p)) {
        try {
          const buf = readFileSync(p)
          if (buf.length > 0) {
            const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
            fonts.push({
              name: 'Inter',
              data: arrayBuffer,
              weight,
              style: 'normal',
            })
            break
          }
        } catch {
          // try next path
        }
      }
    }
  }

  if (fonts.length > 0) {
    cachedFonts = fonts
  }
  return fonts
}

export async function loadStoryFonts(): Promise<OgFont[]> {
  const allFonts = getBundledOgFontsSync()
  if (allFonts.length > 0) {
    return allFonts.filter((f) => [400, 500, 600, 700, 800, 900].includes(f.weight))
  }
  return []
}

export async function loadPostFonts(): Promise<OgFont[]> {
  const allFonts = getBundledOgFontsSync()
  if (allFonts.length > 0) {
    return allFonts.filter((f) => [500, 600, 700, 800].includes(f.weight))
  }
  return []
}
