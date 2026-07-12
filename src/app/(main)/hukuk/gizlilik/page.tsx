import { permanentRedirect } from 'next/navigation'

/** Canonical privacy policy lives at /gizlilik — avoid duplicate indexed URLs. */
export default function HukukGizlilikRedirectPage() {
  permanentRedirect('/gizlilik')
}
