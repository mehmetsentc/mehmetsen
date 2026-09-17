import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Spor is a Feed 2 category chip, not a magazine section. */
export default function CitySporPage() {
  redirect('/?category=spor')
}
