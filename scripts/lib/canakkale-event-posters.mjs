#!/usr/bin/env node
/**
 * Generate branded PNG posters for Çanakkale local events.
 * Output: public/events/canakkale/{slug}.png
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const BRAND = '#E50914'
const BRAND_DARK = '#991B1B'
const WIDTH = 800
const HEIGHT = 500

const TYPE_COLORS = {
  festival: '#F59E0B',
  bienal: '#8B5CF6',
  yarışma: '#3B82F6',
  yarismasi: '#3B82F6',
  konser: '#A855F7',
  panayır: '#10B981',
  panayiri: '#10B981',
  şenlik: '#EC4899',
  senlik: '#EC4899',
  spor: '#06B6D4',
  fuar: '#6366F1',
  film: '#14B8A6',
  kültür: '#F97316',
  kultur: '#F97316',
  default: '#64748B',
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function pickTypeTag(tags = []) {
  const priority = [
    'festival',
    'bienal',
    'film',
    'fuar',
    'panayır',
    'panayiri',
    'konser',
    'yarışma',
    'yarismasi',
    'şenlik',
    'senlik',
    'spor',
    'kültür',
    'kultur',
  ]
  const normalized = tags.map((t) => t.toLocaleLowerCase('tr-TR'))
  for (const key of priority) {
    if (normalized.includes(key)) return key
  }
  return 'default'
}

function wrapTitle(title, maxChars = 28) {
  const words = title.split(/\s+/)
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 4)
}

function buildPosterSvg({ title, districtName, dateLabel, typeTag }) {
  const lines = wrapTitle(title)
  const typeColor = TYPE_COLORS[typeTag] ?? TYPE_COLORS.default
  const typeLabel = typeTag === 'default' ? 'etkinlik' : typeTag
  const lineYStart = 170 - (lines.length - 1) * 18
  const titleSvg = lines
    .map(
      (line, i) =>
        `<text x="400" y="${lineYStart + i * 46}" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700">${escapeXml(line)}</text>`
    )
    .join('\n')

  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND}"/>
      <stop offset="100%" stop-color="${BRAND_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${WIDTH}" height="6" fill="#FFFFFF" opacity="0.25"/>
  <text x="36" y="48" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800">NaHaber</text>
  <text x="36" y="72" fill="#FFFFFF" opacity="0.85" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="600">ÇANAKKALE ETKİNLİK</text>
  <rect x="36" y="88" width="120" height="28" rx="14" fill="#FFFFFF"/>
  <text x="96" y="107" text-anchor="middle" fill="${BRAND}" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="800">ÜCRETSİZ</text>
  <rect x="164" y="88" width="${Math.max(72, typeLabel.length * 11 + 24)}" height="28" rx="14" fill="${typeColor}"/>
  <text x="${164 + Math.max(72, typeLabel.length * 11 + 24) / 2}" y="107" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700">${escapeXml(typeLabel.toLocaleUpperCase('tr-TR'))}</text>
  ${titleSvg}
  <text x="400" y="360" text-anchor="middle" fill="#FFFFFF" opacity="0.92" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600">${escapeXml(districtName)}</text>
  <text x="400" y="392" text-anchor="middle" fill="#FFFFFF" opacity="0.78" font-family="Arial, Helvetica, sans-serif" font-size="15">${escapeXml(dateLabel)}</text>
  <text x="400" y="452" text-anchor="middle" fill="#FFFFFF" opacity="0.55" font-family="Arial, Helvetica, sans-serif" font-size="12">Halka açık · canakkale.nahaber.com/etkinlik</text>
</svg>`
}

export async function generateEventPoster(event, outputDir) {
  const typeTag = pickTypeTag(event.tags)
  const svg = buildPosterSvg({
    title: event.title,
    districtName: event.districtName,
    dateLabel: event.dateLabel,
    typeTag,
  })

  await mkdir(outputDir, { recursive: true })
  const pngPath = join(outputDir, `${event.slug}.png`)
  const png = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer()
  await writeFile(pngPath, png)
  return pngPath
}

export async function ensureEventPosters(events, rootDir = process.cwd()) {
  const outputDir = join(rootDir, 'public', 'events', 'canakkale')
  const created = []
  const skipped = []

  for (const event of events) {
    const pngPath = join(outputDir, `${event.slug}.png`)
    if (existsSync(pngPath)) {
      skipped.push(event.slug)
      continue
    }
    await generateEventPoster(event, outputDir)
    created.push(event.slug)
  }

  return { outputDir, created, skipped }
}
