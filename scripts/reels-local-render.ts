/**
 * Local check for the reel renderer (no Firestore / TTS):
 *   npx tsx scripts/reels-local-render.ts <voice.wav> <image.jpg|video.mp4|none> <out.mp4>
 */
import { promises as fs } from 'node:fs'
import { renderReel, type ReelMedia } from '../src/lib/reels/renderReel'

async function main() {
  const [voice, mediaArg, out] = process.argv.slice(2)
  if (!voice || !mediaArg || !out) throw new Error('usage: <voice.wav> <image|video|none> <out.mp4>')
  const media: ReelMedia =
    mediaArg === 'none'
      ? { kind: 'none' }
      : /\.(mp4|mov|m4v|webm)$/i.test(mediaArg)
        ? { kind: 'video', path: mediaArg }
        : { kind: 'image', data: await fs.readFile(mediaArg) }
  const t0 = Date.now()
  const r = await renderReel({
    headline: 'GESTAŞ Bozcaada ve Gökçeada seferlerini iptal etti',
    summary:
      "Kuzey Ege'deki olumsuz hava nedeniyle yarın Geyikli-Bozcaada ve Kabatepe-Gökçeada hatlarında feribot seferi yapılmayacak.",
    category: 'Duyuru',
    place: 'Çanakkale',
    media,
    voiceWav: await fs.readFile(voice),
  })
  await fs.writeFile(out, r.mp4)
  console.log(JSON.stringify({ out, seconds: r.seconds, renderMs: Date.now() - t0, bytes: r.mp4.length }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
