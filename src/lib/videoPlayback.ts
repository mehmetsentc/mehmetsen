'use client'

/** Pause every in-page video (feed cards, reels, post detail). */
export function pauseAllPageVideos() {
  if (typeof document === 'undefined') return
  document.querySelectorAll('video').forEach((el) => {
    try {
      el.pause()
    } catch {
      // ignore
    }
  })
}
