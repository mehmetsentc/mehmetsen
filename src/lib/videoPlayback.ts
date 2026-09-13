'use client'

type ReelsAudioSink = (muted: boolean) => void

let activeReelsAudioSink: ReelsAudioSink | null = null

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

/** Keep a single native media element playing; pause the rest. */
export function pauseOtherPageVideos(keep?: HTMLMediaElement | null) {
  if (typeof document === 'undefined') return
  document.querySelectorAll('video').forEach((el) => {
    if (keep && el === keep) return
    try {
      el.pause()
    } catch {
      // ignore
    }
  })
}

/** Active /video|/reels player applies mute in the same user-gesture tick. */
export function setActiveReelsAudioSink(sink: ReelsAudioSink | null) {
  activeReelsAudioSink = sink
}

export function applyReelsAudioPreference(muted: boolean) {
  activeReelsAudioSink?.(muted)
}
