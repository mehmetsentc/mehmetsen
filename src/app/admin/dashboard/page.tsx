import { redirect } from 'next/navigation'

/**
 * Tekil admin dashboard noktası `/admin`. Eski `/admin/dashboard` route'una
 * gelen istekler 308 ile ana panele yönlendirilir.
 */
export default function DashboardRedirectPage() {
  redirect('/admin')
}
