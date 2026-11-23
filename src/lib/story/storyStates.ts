/**
 * STORY-1 — what the caption overlay shows at each moment (pure).
 * The overlay is a PNG sequence: one image per distinct state, held until the
 * next change (scene start, caption chunk, each spoken word, label pop frames).
 */
import { FPS, type StoryTimeline } from './storyProject'

export type SceneMeta = { label: string | null; aiNote: boolean; source: string | null; /** GÖREV 45 «Bilgi animasyonu» */ headline?: string | null; sub?: string | null }

export type OverlayState = {
  scene: number
  chunk: number | null
  /** words of the chunk already spoken */
  spoken: number
  /** label pop-in progress 0..1 (quantized) */
  pop: number
}

export const POP_S = 0.3
const POP_STEPS = 9

export function stateAt(tl: StoryTimeline, t: number): OverlayState | null {
  let si = -1
  for (const s of tl.scenes) if (s.start <= t + 1e-6) si = s.index
  if (si < 0) return null
  const sc = tl.scenes[si]
  let chunk: number | null = null
  sc.chunks.forEach((c, i) => {
    if (c.start <= t + 1e-6 && t < c.end - 1e-6) chunk = i
  })
  const spoken = chunk === null ? 0 : sc.chunks[chunk].words.filter((w) => w.start <= t + 1e-6).length
  const raw = (t - sc.labelAt) / POP_S
  const pop = raw <= 0 ? 0 : raw >= 1 ? 1 : Math.round(raw * POP_STEPS) / POP_STEPS
  return { scene: si, chunk, spoken, pop }
}

const keyOf = (s: OverlayState | null) => (s ? `${s.scene}|${s.chunk}|${s.spoken}|${s.pop}` : 'none')

/** Distinct states with their start time and duration, covering [0, total). */
export function overlayStates(tl: StoryTimeline): Array<{ t: number; duration: number; state: OverlayState | null }> {
  const times = new Set<number>([0])
  const q = (x: number) => Math.max(0, Math.round(x * FPS) / FPS)
  for (const s of tl.scenes) {
    times.add(q(s.start))
    for (let k = 0; k <= POP_STEPS; k++) times.add(q(s.labelAt + (POP_S * k) / POP_STEPS))
    for (const c of s.chunks) {
      times.add(q(c.start))
      times.add(q(c.end))
      for (const w of c.words) times.add(q(w.start))
    }
  }
  const sorted = [...times].filter((t) => t < tl.total).sort((a, b) => a - b)
  const out: Array<{ t: number; duration: number; state: OverlayState | null }> = []
  for (const t of sorted) {
    const st = stateAt(tl, t + 0.5 / FPS)
    if (out.length && keyOf(out[out.length - 1].state) === keyOf(st)) continue
    out.push({ t, duration: 0, state: st })
  }
  for (let i = 0; i < out.length; i++) out[i].duration = (i + 1 < out.length ? out[i + 1].t : tl.total) - out[i].t
  return out.filter((s) => s.duration > 0)
}
