import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const header = readFileSync(join(process.cwd(), 'src/components/layout/MobileSubpageHeader.tsx'), 'utf8')
const submit = readFileSync(join(process.cwd(), 'src/components/profile/SubmitNewsModal.tsx'), 'utf8')
const profile = readFileSync(join(process.cwd(), 'src/app/(main)/settings/profile/page.tsx'), 'utf8')
const onboarding = readFileSync(join(process.cwd(), 'src/components/onboarding/OnboardingFlow.tsx'), 'utf8')

describe('UI-V2 subpage navigation', () => {
  it('exposes a visible Geri control', () => {
    expect(header).toContain('aria-label="Geri"')
    expect(header).toContain('<span>Geri</span>')
    expect(header).toContain('label="Geri"')
  })

  it('wires Haber Gönder to the shared header with back + close', () => {
    expect(submit).toContain('MobileSubpageHeader')
    expect(submit).toContain('onBack=')
    expect(submit).toContain('onClose={onClose}')
    expect(submit).toContain('Haber Gönder')
    expect(submit).toContain('3 adımda tamamla')
  })

  it('keeps the three submission steps', () => {
    expect(submit).toContain("label: 'Medya'")
    expect(submit).toContain("label: 'İçerik'")
    expect(submit).toContain("label: 'Gönder'")
  })

  it('reuses the same header on profile edit and onboarding', () => {
    expect(profile).toContain('MobileSubpageHeader')
    expect(profile).toContain('Profil Düzenle')
    expect(onboarding).toContain('MobileSubpageHeader')
    expect(onboarding).toContain('fallbackHref={ROUTES.HOME}')
  })
})
