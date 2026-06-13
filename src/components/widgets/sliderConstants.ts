/** Shared slider layout — keeps server hero and client carousel in sync (CLS). */
export const SLIDER_OUTER_STYLE = {
  margin: '0 calc(-1 * var(--layout-gutter))',
  width: 'calc(100% + 2 * var(--layout-gutter))',
} as const

export const SLIDER_HEIGHT_CLASS = 'h-[22rem] md:h-[32rem]'
