export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-brand))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--color-bg))]'

export const primaryButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`

export const quietButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 text-sm font-semibold text-[rgb(var(--color-text))] transition hover:bg-[rgb(var(--color-surface))] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`

export const ghostButton = `inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-[rgb(var(--color-text))] transition hover:bg-[rgb(var(--color-surface))] ${focusRing}`

export const fieldClass = `w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] ${focusRing}`

export const cardClass = 'rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'
