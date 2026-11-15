/**
 * FinOps (15 Nov 2026): crawl hourly instead of every 30 min between 01:00 and 05:59
 * Türkiye time (UTC+3, no DST). The cron still fires every 30 min; the :30 run is
 * skipped at night. Sources keep their own cadence, so anything due is picked up by
 * the next (:00) tick. Set CRAWLER_NIGHT_THROTTLE=0 to turn this off; ?force=1 on the
 * cron URL bypasses it for a manual run.
 */
export const NIGHT_START_TR_HOUR = 1
export const NIGHT_END_TR_HOUR = 6

export function isCrawlerNightThrottleEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CRAWLER_NIGHT_THROTTLE !== '0'
}

/** True for the half-hour tick inside the night window (cron jitter tolerated: minute >= 15). */
export function shouldSkipNightTick(now: Date, env: Record<string, string | undefined> = process.env): boolean {
  if (!isCrawlerNightThrottleEnabled(env)) return false
  const trHour = (now.getUTCHours() + 3) % 24
  if (trHour < NIGHT_START_TR_HOUR || trHour >= NIGHT_END_TR_HOUR) return false
  return now.getUTCMinutes() >= 15
}
