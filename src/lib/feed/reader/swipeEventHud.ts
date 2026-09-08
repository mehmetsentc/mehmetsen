/**
 * Temporary Feed→Reader swipe event HUD (pilot + ?readerDebug=1 only).
 * In-memory visual diagnostic — no telemetry, DB, Firebase, or analytics.
 */

export const SWIPE_EVENT_SEQUENCE_MAX = 12

export type SwipeHudEventPhase = 'NONE' | 'DOWN' | 'MOVE' | 'UP' | 'CANCEL'

export type SwipeHudOwner =
  | 'NONE'
  | 'VERTICAL'
  | 'HORIZONTAL'
  | 'INTERACTIVE'
  | 'SYSTEM_EDGE'
  | 'HANDLER_ABSENT'
  | 'OTHER'

export type SwipeHudLastAction =
  | 'NONE'
  | 'LOCK'
  | 'CANCEL'
  | 'COMMIT'
  | 'OPEN_READER'
  | 'REJECT_DIRECTION'
  | 'REJECT_AXIS'
  | 'REJECT_THRESHOLD'
  | 'REJECT_INTERACTIVE'
  | 'REJECT_EDGE'
  | 'REJECT_HANDLER'

export type FeedSwipeEventHudSnapshot = {
  event: SwipeHudEventPhase
  pointerType: string
  startX: number | null
  currentX: number | null
  dx: number | null
  startY: number | null
  currentY: number | null
  dy: number | null
  owner: SwipeHudOwner
  directionValid: boolean
  dominance: number | null
  activated: boolean
  captured: boolean
  progress: number
  reducedMotion: boolean
  targetTag: string | null
  interactiveTarget: boolean
  touchAction: string | null
  lastAction: SwipeHudLastAction
  sequence: string
  moveCount: number
  /** Short lifecycle ring surviving Feed↔Reader (in-memory only). */
  lifecycle: string
  commitLock: boolean
  gestureEpoch: number
}

export const EMPTY_SWIPE_EVENT_HUD: FeedSwipeEventHudSnapshot = {
  event: 'NONE',
  pointerType: '—',
  startX: null,
  currentX: null,
  dx: null,
  startY: null,
  currentY: null,
  dy: null,
  owner: 'NONE',
  directionValid: false,
  activated: false,
  captured: false,
  progress: 0,
  reducedMotion: false,
  dominance: null,
  targetTag: null,
  interactiveTarget: false,
  touchAction: null,
  lastAction: 'NONE',
  sequence: '',
  moveCount: 0,
  lifecycle: '',
  commitLock: false,
  gestureEpoch: 0,
}

/** Pilot grant + explicit ?readerDebug=1 — never expand cohort. */
export function shouldShowFeedSwipeEventHud(opts: {
  readerDebugQuery: boolean
  currentMatchesActiveFeedReaderGrant: boolean | null | undefined
}): boolean {
  return Boolean(
    opts.readerDebugQuery && opts.currentMatchesActiveFeedReaderGrant === true
  )
}

export function appendSwipeEventSequence(
  prev: string,
  phase: 'DOWN' | 'MOVE' | 'UP' | 'CANCEL',
  max = SWIPE_EVENT_SEQUENCE_MAX
): string {
  const parts = prev ? prev.split('>').filter(Boolean) : []
  if (phase === 'DOWN') return 'DOWN'
  if (phase === 'MOVE' && parts[parts.length - 1] === 'MOVE') {
    // Collapse consecutive MOVE noise but keep count marker via trailing MOVE
    return parts.join('>')
  }
  parts.push(phase)
  while (parts.length > max) parts.shift()
  return parts.join('>')
}

export function formatSwipeEventHudLines(
  s: FeedSwipeEventHudSnapshot,
  extras?: {
    readerSession: string
    readerProgress: number
    capability: string
  }
): string[] {
  const num = (v: number | null | undefined, digits = 0) =>
    v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits)
  return [
    `ev:${s.event} pt:${s.pointerType} seq:${s.sequence || '—'}`,
    `x:${num(s.startX)}→${num(s.currentX)} dx:${num(s.dx)}`,
    `y:${num(s.startY)}→${num(s.currentY)} dy:${num(s.dy)}`,
    `own:${s.owner} dirOK:${s.directionValid ? 'Y' : 'N'} act:${s.activated ? 'Y' : 'N'} cap:${s.captured ? 'Y' : 'N'}`,
    `dom:${num(s.dominance, 2)} prog:${s.progress.toFixed(2)} rAF:${s.reducedMotion ? 'Y' : 'N'} moves:${s.moveCount}`,
    `tgt:${s.targetTag ?? '—'} int:${s.interactiveTarget ? 'Y' : 'N'} ta:${s.touchAction ?? '—'}`,
    `last:${s.lastAction} lock:${s.commitLock ? 'Y' : 'N'} ep:${s.gestureEpoch}`,
    `life:${s.lifecycle || '—'}`,
    extras
      ? `rs:${extras.readerSession} rp:${extras.readerProgress.toFixed(2)} cap:${extras.capability}`
      : null,
  ].filter((line): line is string => Boolean(line))
}

export function readTouchActionForTarget(target: EventTarget | null): string | null {
  if (!target || typeof window === 'undefined') return null
  if (!(target instanceof Element)) return null
  try {
    return window.getComputedStyle(target).touchAction || null
  } catch {
    return null
  }
}

export function targetTagName(target: EventTarget | null): string | null {
  if (!target || !(target instanceof Element)) return null
  const id = target.id ? `#${target.id}` : ''
  const testId = target.getAttribute('data-testid')
  const tid = testId ? `[${testId}]` : ''
  return `${target.tagName.toLowerCase()}${id}${tid}`
}
