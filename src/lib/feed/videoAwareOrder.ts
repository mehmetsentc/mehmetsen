/**
 * FEED-UX-2 — video-aware order inside one feed page.
 * The ranking decides which stories are on the page; this step only nudges stories that
 * play a video (their own video or a NaHaber reel) a few places up and keeps two videos
 * from sitting back to back, so the feed reads news · video · news like a Reels feed.
 * The first card never moves (breaking / top story keeps its place). Page-local only:
 * the session's id window and cursors are untouched. FEED_VIDEO_BOOST=off disables it.
 */
export const VIDEO_LIFT = 3

export function arrangeVideoAware<T extends { video?: string | null }>(items: T[], lift = VIDEO_LIFT): T[] {
  if ((process.env.FEED_VIDEO_BOOST ?? 'on').toLowerCase() === 'off') return items
  if (items.length < 3 || !items.some((i) => i.video)) return items
  const [head, ...rest] = items
  const keyed = rest.map((item, idx) => ({ item, key: idx - (item.video ? lift : 0), idx }))
  keyed.sort((a, b) => a.key - b.key || (a.item.video ? 0 : 1) - (b.item.video ? 0 : 1) || a.idx - b.idx)
  const out = keyed.map((k) => k.item)
  // no two videos in a row when a story without video can come between them
  for (let i = 1; i < out.length; i++) {
    if (!out[i]!.video || !out[i - 1]!.video) continue
    const j = out.findIndex((x, k) => k > i && !x.video)
    if (j < 0) break
    const [plain] = out.splice(j, 1)
    out.splice(i, 0, plain!)
  }
  if (head!.video && out[0]?.video) {
    const j = out.findIndex((x) => !x.video)
    if (j > 0) out.unshift(...out.splice(j, 1))
  }
  return [head!, ...out]
}
