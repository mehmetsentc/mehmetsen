/**
 * Local test: verify contain+blur behavior with the real poster image.
 * Simulates what embedCoverTopImage does for:
 *  - Social post zone: 1080×580 (landscape)
 *  - Story zone: 1080×1080 (square)
 *
 * Usage: node .tmp/test-og-fit.mjs
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const POSTER_PATH = '/Users/user/.cursor/projects/Users-user-nahaber/assets/Gemini_Generated_Image_akfna0akfna0akfn-c7c6a799-964f-4c07-8e2a-1b97d4e43fb1.png'

const outDir = join(__dirname, 'og-fit-test')
mkdirSync(outDir, { recursive: true })

async function compositeContainBlur(buf, srcW, srcH, targetW, targetH, quality = 84) {
  const bgBlur = await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
    .blur(40)
    .toBuffer()

  const darkOverlay = Buffer.from(
    `<svg width="${targetW}" height="${targetH}">
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)"/>
    </svg>`
  )

  const srcAspect = srcW / srcH
  const tgtAspect = targetW / targetH
  let fgW, fgH

  if (srcAspect > tgtAspect) {
    fgW = targetW
    fgH = Math.round(targetW / srcAspect)
  } else {
    fgH = targetH
    fgW = Math.round(targetH * srcAspect)
  }

  const fg = await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize(fgW, fgH, { fit: 'fill' })
    .toBuffer()

  const fgLeft = Math.round((targetW - fgW) / 2)
  const fgTop = Math.round((targetH - fgH) / 2)

  return sharp(bgBlur)
    .composite([
      { input: darkOverlay, blend: 'over' },
      { input: fg, left: fgLeft, top: fgTop, blend: 'over' },
    ])
    .jpeg({ quality, mozjpeg: true })
    .toBuffer()
}

async function testFit(label, targetW, targetH) {
  const buf = readFileSync(POSTER_PATH)
  const meta = await sharp(buf).metadata()
  const srcW = meta.width
  const srcH = meta.height
  const srcAspect = srcW / srcH
  const targetAspect = targetW / targetH
  const ratio = srcAspect / targetAspect

  console.log(`\n[${label}]`)
  console.log(`  Source: ${srcW}×${srcH} (aspect ${srcAspect.toFixed(3)})`)
  console.log(`  Target: ${targetW}×${targetH} (aspect ${targetAspect.toFixed(3)})`)
  console.log(`  Ratio: ${ratio.toFixed(3)} → ${ratio < 0.85 || ratio > 1.18 ? 'CONTAIN+BLUR' : 'COVER'}`)

  // Old method (cover + attention)
  const oldResult = await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize(targetW, targetH, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()

  // New method (contain + blur)
  const newResult = await compositeContainBlur(buf, srcW, srcH, targetW, targetH, 84)

  const oldPath = join(outDir, `${label}-OLD-cover.jpg`)
  const newPath = join(outDir, `${label}-NEW-contain-blur.jpg`)
  writeFileSync(oldPath, oldResult)
  writeFileSync(newPath, newResult)
  console.log(`  Old: ${oldPath}`)
  console.log(`  New: ${newPath}`)
}

await testFit('social-post-1080x580', 1080, 580)
await testFit('story-1080x1080', 1080, 1080)
console.log('\nDone! Check .tmp/og-fit-test/ for comparison images.')
