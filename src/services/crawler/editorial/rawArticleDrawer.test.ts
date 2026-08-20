/**
 * Ham Haberler RawArticleDrawer — close-path regression contracts.
 * Complements production UI verification (unit tests alone are not acceptance).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const drawerSrc = readFileSync(
  resolve(__dirname, '../../../components/admin/crawler/RawArticleDrawer.tsx'),
  'utf8'
)
const pageSrc = readFileSync(
  resolve(__dirname, '../../../app/admin/crawler/raw-articles/page.tsx'),
  'utf8'
)

describe('RawArticleDrawer close contracts', () => {
  it('portals to document.body (escape admin overflow stacking)', () => {
    expect(drawerSrc).toContain('createPortal')
    expect(drawerSrc).toContain('document.body')
  })

  it('X button is type=button and calls closeDrawer', () => {
    expect(drawerSrc).toMatch(/data-drawer-close="true"/)
    expect(drawerSrc).toMatch(/type="button"/)
    expect(drawerSrc).toContain('closeDrawer()')
  })

  it('ESC uses capture listener and closes', () => {
    expect(drawerSrc).toContain("key === 'Escape'")
    expect(drawerSrc).toContain("addEventListener('keydown', onKey, true)")
    expect(drawerSrc).toContain("removeEventListener('keydown', onKey, true)")
  })

  it('backdrop closes; panel stops propagation', () => {
    expect(drawerSrc).toContain('data-drawer-backdrop="true"')
    expect(drawerSrc).toContain('data-drawer-panel="true"')
    expect(drawerSrc).toContain('e.stopPropagation()')
  })

  it('restores body overflow + padding on unmount', () => {
    expect(drawerSrc).toContain("document.body.style.overflow = 'hidden'")
    expect(drawerSrc).toContain('document.body.style.overflow = prevOverflow')
    expect(drawerSrc).toContain('document.body.style.paddingRight = prevPaddingRight')
  })

  it('uses high z-modal so header/nav cannot intercept X', () => {
    expect(drawerSrc).toContain('z-modal')
  })
})

describe('raw-articles page closeDrawer race fix', () => {
  it('exposes single closeDrawer clearing selection', () => {
    expect(pageSrc).toContain('const closeDrawer = useCallback')
    expect(pageSrc).toContain('setDetail(null)')
    expect(pageSrc).toContain('setDetailMedia([])')
    expect(pageSrc).toContain('onClose={closeDrawer}')
  })

  it('detail fetch keys on detailId and aborts on close', () => {
    expect(pageSrc).toContain('const detailId = detail?.id ?? null')
    expect(pageSrc).toContain('AbortController')
    expect(pageSrc).toContain('ac.abort()')
    expect(pageSrc).toContain('if (!prev || prev.id !== detailId) return prev')
  })

  it('open path uses openDrawer not raw setDetail in Görüntüle', () => {
    expect(pageSrc).toContain('onClick={() => openDrawer(row)}')
    expect(pageSrc).not.toMatch(/Görüntüle[\s\S]{0,80}setDetail\(row\)/)
  })
})
