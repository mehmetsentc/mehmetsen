import { permanentRedirect } from 'next/navigation'

/** Eski URL — kanonik künye /kunye */
export default function KuneRedirectPage() {
  permanentRedirect('/kunye')
}
