/**
 * GET /api/reels/music/<name> — NaHaber's own synthesized theme music (studio «▶ dinle»).
 * Public, cacheable; only the known bed names are served.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'

const NAMES = new Set(['sakin', 'modern', 'akustik', 'kurumsal', 'enerjik', 'sondakika', 'lofi'])

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params
  if (!NAMES.has(name)) return new Response('not found', { status: 404 })
  const file = path.join(process.cwd(), 'src/lib/reels/assets/audio/broadcast', `bed-${name}.m4a`)
  const buf = await fs.readFile(file).catch(() => null)
  if (!buf) return new Response('not found', { status: 404 })
  return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'audio/mp4', 'Cache-Control': 'public, max-age=86400' } })
}
