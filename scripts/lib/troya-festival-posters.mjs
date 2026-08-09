#!/usr/bin/env node
/**
 * Crop event cover images from Troya Festival 2026 poster assets.
 * Output: public/events/canakkale/troya-2026/{slug}.jpg
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const OUTPUT_WIDTH = 800
const OUTPUT_HEIGHT = 500

/** Percentage-based crop regions keyed by poster layout preset. */
const CROP_PRESETS = {
  full: { left: 0, top: 0, width: 100, height: 100 },

  // Three equal panels on venue banners (1024×455)
  left: { left: 26.5, top: 12, width: 23.5, height: 62 },
  center: { left: 50, top: 12, width: 23.5, height: 62 },
  right: { left: 73.5, top: 12, width: 23.5, height: 62 },

  // Sports poster clusters
  volleyball: { left: 26, top: 2, width: 22, height: 48 },
  tennis: { left: 48, top: 2, width: 22, height: 48 },
  dance: { left: 72, top: 2, width: 25, height: 48 },
  cycling: { left: 32, top: 48, width: 36, height: 42 },
  signing: { left: 68, top: 38, width: 30, height: 48 },

  // Exhibition poster 2×3 grid
  'row1-left': { left: 26, top: 22, width: 23, height: 38 },
  'row1-center': { left: 50, top: 22, width: 23, height: 38 },
  'row1-right': { left: 74, top: 22, width: 23, height: 38 },
  'row2-left': { left: 26, top: 58, width: 23, height: 32 },
  'row2-center': { left: 50, top: 58, width: 23, height: 32 },
  'row2-right': { left: 74, top: 58, width: 23, height: 32 },
}

export function resolveAssetsDir(rootDir = process.cwd()) {
  const candidates = [
    join(rootDir, 'assets', 'troya-2026-posters'),
    join(
      process.env.HOME ?? '',
      '.cursor/projects/Users-user-nahaber-canakkale-nahaber/assets'
    ),
  ]
  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  throw new Error(
    'Poster assets not found. Copy poster PNGs to assets/troya-2026-posters/ or ensure Cursor assets path exists.'
  )
}

function pctRect(meta, preset) {
  const region = CROP_PRESETS[preset] ?? CROP_PRESETS.full
  const left = Math.round((meta.width * region.left) / 100)
  const top = Math.round((meta.height * region.top) / 100)
  const width = Math.round((meta.width * region.width) / 100)
  const height = Math.round((meta.height * region.height) / 100)
  return {
    left: Math.max(0, Math.min(left, meta.width - 1)),
    top: Math.max(0, Math.min(top, meta.height - 1)),
    width: Math.max(1, Math.min(width, meta.width - left)),
    height: Math.max(1, Math.min(height, meta.height - top)),
  }
}

export async function extractEventCover(event, assetsDir, outputDir) {
  const posterFile = event.poster?.file
  const cropKey = event.poster?.crop ?? 'full'
  if (!posterFile) {
    throw new Error(`Event ${event.slug} missing poster.file`)
  }

  const sourcePath = join(assetsDir, posterFile)
  if (!existsSync(sourcePath)) {
    throw new Error(`Poster source not found: ${sourcePath}`)
  }

  await mkdir(outputDir, { recursive: true })
  const outPath = join(outputDir, `${event.slug}.jpg`)

  const meta = await sharp(sourcePath).metadata()
  const extract = pctRect(meta, cropKey)

  const buffer = await sharp(sourcePath)
    .extract(extract)
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()

  await writeFile(outPath, buffer)
  return outPath
}

export async function ensureTroyaEventCovers(events, rootDir = process.cwd(), { force = false } = {}) {
  const assetsDir = resolveAssetsDir(rootDir)
  const outputDir = join(rootDir, 'public', 'events', 'canakkale', 'troya-2026')
  const created = []
  const skipped = []

  for (const event of events) {
    const outPath = join(outputDir, `${event.slug}.jpg`)
    if (existsSync(outPath) && !force) {
      skipped.push(event.slug)
      continue
    }
    await extractEventCover(event, assetsDir, outputDir)
    created.push(event.slug)
  }

  return { outputDir, assetsDir, created, skipped }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  import('node:fs').then(({ readFileSync, existsSync: exists }) => {
    const root = process.cwd()
    const dataFile = join(root, 'data', 'troya-festival-2026-events.json')
    if (!exists(dataFile)) {
      console.error('Missing data file:', dataFile)
      process.exit(1)
    }
    const { events } = JSON.parse(readFileSync(dataFile, 'utf8'))
    const force = process.argv.includes('--force')
    ensureTroyaEventCovers(events, root, { force }).then((result) => {
      console.log(`Assets: ${result.assetsDir}`)
      console.log(`Output: ${result.outputDir}`)
      console.log(`Created: ${result.created.length}, skipped: ${result.skipped.length}`)
    })
  })
}
