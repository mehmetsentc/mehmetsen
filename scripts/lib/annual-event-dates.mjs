const ISTANBUL_TZ = 'Europe/Istanbul'

function istanbulParts(iso) {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISTANBUL_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  }
}

function istanbulLocalToUtcIso(year, month, day, hour, minute, second) {
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second)).toISOString()
}

function buildOccurrence(templateStartIso, templateEndIso, year) {
  const s = istanbulParts(templateStartIso)
  const startsAt = istanbulLocalToUtcIso(year, s.month, s.day, s.hour, s.minute, s.second)
  if (!templateEndIso) return { startsAt }
  const e = istanbulParts(templateEndIso)
  const endsAt = istanbulLocalToUtcIso(year, e.month, e.day, e.hour, e.minute, e.second)
  return { startsAt, endsAt }
}

export function resolveAnnualOccurrence(templateStartIso, templateEndIso, now = new Date()) {
  const nowIso = now.toISOString()
  const nowYear = istanbulParts(nowIso).year
  for (const year of [nowYear, nowYear + 1]) {
    const occ = buildOccurrence(templateStartIso, templateEndIso, year)
    const activeUntil = occ.endsAt ?? occ.startsAt
    if (activeUntil >= nowIso) return occ
  }
  return buildOccurrence(templateStartIso, templateEndIso, nowYear + 1)
}

export function toAnnualDateLabel(dateLabel) {
  if (!dateLabel?.trim()) return dateLabel
  let label = dateLabel.replace(/\s*20\d{2}/g, '').replace(/\s{2,}/g, ' ').trim()
  label = label.replace(/,\s*,/g, ',').replace(/\(\s*\)/g, '').trim()
  if (!/\(yıllık\)/i.test(label)) label = `${label} (yıllık)`
  return label.replace(/\s{2,}/g, ' ').trim()
}
