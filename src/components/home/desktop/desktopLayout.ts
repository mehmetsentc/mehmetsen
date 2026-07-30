/** Shared desktop newspaper grid — 4 cards per row at xl, 2 on smaller lg viewports. */
export const FOUR_CARD_GRID = 'grid grid-cols-2 gap-4 xl:grid-cols-4'

/** Manşet: sol daha geniş (7/5) — tek lead ile sağ özetler yükseklikçe dengeye gelsin. */
export const HERO_SPLIT_SECTION =
  'grid grid-cols-12 items-start gap-5 lg:gap-6'

export const HERO_SPLIT_MAIN = 'col-span-12 min-w-0 lg:col-span-7'

export const HERO_SPLIT_ASIDE =
  'col-span-12 min-w-0 lg:col-span-5 lg:border-l lg:border-[rgb(var(--color-border))] lg:pl-5'

export const DESKTOP_SECTION_DIVIDER =
  'mb-10 border-b border-[rgb(var(--color-border))] pb-10'
