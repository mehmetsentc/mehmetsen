/**
 * MOBILE-ADMIN-1 — pure rules for the mobile admin panel (unit-tested).
 */
import type { ArticleBlock } from '@/lib/articleBlocks'

/**
 * Full-screen flows (editor, quick composer, single-item review) hide the header and
 * bottom bar. Lists such as /admin/approvals keep them — the old `pathname === p`
 * check hid the chrome on the approvals LIST too (no way back on a phone).
 */
const HIDE_CHROME_EXACT = ['/admin/news/create', '/admin/quick']
const HIDE_CHROME_UNDER = ['/admin/approvals/']

export function shouldHideChrome(pathname: string): boolean {
  if (/^\/admin\/news\/[^/]+\/edit\/?$/.test(pathname)) return true
  if (HIDE_CHROME_EXACT.some((p) => pathname === p || pathname === `${p}/`)) return true
  return HIDE_CHROME_UNDER.some((p) => pathname.startsWith(p) && pathname.length > p.length)
}

export type MobileTabRule = { href: string; exact?: boolean; also?: readonly string[] }

export function isTabActive(pathname: string, tab: MobileTabRule): boolean {
  if (tab.exact) return pathname === tab.href
  const roots = [tab.href, ...(tab.also ?? [])]
  return roots.some((r) => pathname === r || pathname.startsWith(`${r}/`))
}

/** Plain text → paragraph blocks (blank line = new paragraph; single line breaks join). */
export function bodyToBlocks(body: string): ArticleBlock[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `m${i + 1}`, type: 'paragraph' as const, text }))
}

/** True when a stored body can be edited as plain paragraphs without losing anything. */
export function isPlainParagraphBody(post: { bodyBlocks?: ArticleBlock[] | null; content?: string | null }): boolean {
  const blocks = post.bodyBlocks ?? []
  if (blocks.length) return blocks.every((b) => b.type === 'paragraph')
  return !/<\s*(img|figure|h[1-6]|ul|ol|table|iframe|video)\b/i.test(post.content ?? '')
}
