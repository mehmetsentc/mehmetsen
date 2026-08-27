/**
 * Canonical article SEO context — shared by server fetchers and static article UI.
 * Keep this module free of `server-only` so client-safe components can import the type.
 */
export interface ArticleSeoContext {
  publisher: { slug: string; name: string } | null
  event: { slug: string; title: string; sourceCount: number } | null
}
