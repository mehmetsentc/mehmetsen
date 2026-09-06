/**
 * Feed Reader body HTML — preserve safe semantic hierarchy; fail closed on XSS.
 * Source markup = semantics only. Presentation is Reader-owned (dark V2).
 */

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'hr',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'a',
  'figure',
  'figcaption',
  'img',
  'div',
  'span',
])

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function safeHref(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (v.startsWith('/') && !v.startsWith('//')) return v
  try {
    const u = new URL(v)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString()
  } catch {
    return null
  }
  return null
}

function safeImgSrc(raw: string): string | null {
  return safeHref(raw)
}

/**
 * Allowlist sanitizer for Reader body.
 * Strips presentation (style/color/class/font) so source cannot override Reader theme.
 */
export function sanitizeFeedReaderHtml(html: string): string {
  if (!html?.trim()) return ''

  let out = html
    .replace(/<\/?(?:html|body|head)[^>]*>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<\/?font\b[^>]*>/gi, '')
    .replace(/<h1(\s[^>]*)?>/gi, '<h2>')
    .replace(/<\/h1>/gi, '</h2>')
    .replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, '')
    .replace(/\sclass\s*=\s*("([^"]*)"|'([^']*)')/gi, '')
    .replace(/\scolor\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/gi, '')
    .replace(/\sbgcolor\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/gi, '')
    .replace(/\son\w+\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, 'blocked-data:')
    .replace(/vbscript:/gi, '')

  out = out.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (full, tagRaw: string, attrs = '') => {
    const closing = full.startsWith('</')
    const tag = tagRaw.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return ''
    if (closing) return `</${tag}>`

    if (tag === 'br' || tag === 'hr') return `<${tag}/>`

    if (tag === 'a') {
      const hrefMatch = attrs.match(/\shref\s*=\s*("([^"]*)"|'([^']*)')/i)
      const href = hrefMatch ? safeHref(hrefMatch[2] ?? hrefMatch[3] ?? '') : null
      if (!href) return '<span>'
      return `<a href="${escapeAttr(href)}" rel="noopener noreferrer">`
    }

    if (tag === 'img') {
      const srcMatch = attrs.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)')/i)
      const altMatch = attrs.match(/\salt\s*=\s*("([^"]*)"|'([^']*)')/i)
      const src = srcMatch ? safeImgSrc(srcMatch[2] ?? srcMatch[3] ?? '') : null
      if (!src) return ''
      const alt = altMatch ? escapeAttr(altMatch[2] ?? altMatch[3] ?? '') : ''
      return `<img src="${escapeAttr(src)}" alt="${alt}" loading="lazy"/>`
    }

    return `<${tag}>`
  })

  out = out.replace(/<span>([\s\S]*?)<\/a>/gi, '<span>$1</span>')

  return out.trim()
}

export function plainTextToReaderParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeText(p)}</p>`)
    .join('')
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
