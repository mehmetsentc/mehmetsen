/** Read-depth thresholds for Feed Reader — emit once per session. */

export const READ_DEPTH_THRESHOLDS = [25, 50, 75, 90] as const
export type ReadDepthThreshold = (typeof READ_DEPTH_THRESHOLDS)[number]

export function computeReadDepthPercent(opts: {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}): number {
  const { scrollTop, clientHeight, scrollHeight } = opts
  if (scrollHeight <= clientHeight || scrollHeight <= 0) {
    return scrollHeight > 0 ? 100 : 0
  }
  const maxScroll = scrollHeight - clientHeight
  const pct = (scrollTop / maxScroll) * 100
  return Math.min(100, Math.max(0, Math.round(pct)))
}

/** Returns newly crossed thresholds not already in `seen`. */
export function crossedReadDepthThresholds(
  depthPercent: number,
  seen: ReadonlySet<number>
): ReadDepthThreshold[] {
  const out: ReadDepthThreshold[] = []
  for (const t of READ_DEPTH_THRESHOLDS) {
    if (depthPercent >= t && !seen.has(t)) out.push(t)
  }
  return out
}
