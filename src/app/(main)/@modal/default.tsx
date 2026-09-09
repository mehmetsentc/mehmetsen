/**
 * LP7R.2 Article Lift — default state for the `@modal` parallel-route slot.
 *
 * Next.js requires every parallel-route slot to have a `default.tsx` so it
 * knows what to render for that slot on any route that didn't explicitly
 * match one of its pages (i.e. every route in this app except the
 * intercepted `(.)haber/[slug]`). Returning null means "no modal" — this
 * is purely route-slot plumbing, it renders nothing by itself.
 */
export default function Default() {
  return null
}
