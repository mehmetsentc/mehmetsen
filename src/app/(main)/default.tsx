/**
 * Parallel-route soft-nav safety for the unnamed `children` slot.
 *
 * Next.js requires a default for parallel-route layouts so soft navigations
 * that enter `(main)` (or leave a leaf without rematching children) do not
 * collapse into the global 404. `@modal/default.tsx` covers the modal slot;
 * this covers `children`.
 */
export default function Default() {
  return null
}
