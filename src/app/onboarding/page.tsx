import type { Metadata } from 'next'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'

export const metadata: Metadata = {
  title: 'Profilini Tamamla',
  robots: { index: false, follow: false },
}

export default function OnboardingPage() {
  return (
    <AuthGuard requireAuth>
      <OnboardingFlow />
    </AuthGuard>
  )
}
