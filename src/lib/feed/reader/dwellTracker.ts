/**
 * Active Reader dwell tracker — pauses when document hidden / Reader inactive.
 * Pure class for unit tests; no DOM writes.
 */

export class ReaderDwellTracker {
  private accumulatedMs = 0
  private segmentStartedAt: number | null = null
  private active = false
  private visible = true

  constructor(private readonly now: () => number = () => Date.now()) {}

  open(): void {
    this.accumulatedMs = 0
    this.segmentStartedAt = null
    this.active = true
    this.visible = true
    this.resume()
  }

  setDocumentVisible(visible: boolean): void {
    this.visible = visible
    if (!this.active) return
    if (visible) this.resume()
    else this.pause()
  }

  setReaderActive(active: boolean): void {
    if (!active) {
      this.pause()
      this.active = false
      return
    }
    this.active = true
    if (this.visible) this.resume()
  }

  /** Active dwell ms so far (includes current segment). */
  sample(): number {
    this.flush()
    return this.accumulatedMs
  }

  close(): number {
    this.flush()
    this.active = false
    this.segmentStartedAt = null
    return this.accumulatedMs
  }

  private resume(): void {
    if (!this.active || !this.visible) return
    if (this.segmentStartedAt != null) return
    this.segmentStartedAt = this.now()
  }

  private pause(): void {
    this.flush()
    this.segmentStartedAt = null
  }

  private flush(): void {
    if (this.segmentStartedAt == null) return
    const delta = Math.max(0, this.now() - this.segmentStartedAt)
    this.accumulatedMs += delta
    this.segmentStartedAt = this.now()
  }
}
