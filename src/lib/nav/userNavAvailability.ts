/**
 * User-facing nav product availability.
 *
 * Taxonomy, routes, schema, and historical content stay intact.
 * This only controls whether a product appears in the shared category
 * rail and hamburger tools. Flip `enabled` when the product is verified.
 */
export const USER_NAV_PRODUCTS = {
  skor: {
    enabled: false,
    reason: 'live-score-product-unavailable',
  },
} as const

export type UserNavProductId = keyof typeof USER_NAV_PRODUCTS

export function isUserFacingNavProductEnabled(id: UserNavProductId): boolean {
  return USER_NAV_PRODUCTS[id].enabled
}
