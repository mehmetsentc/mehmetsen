'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ROUTES } from '@/constants/routes'

export default function AdminRootPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace(ROUTES.ADMIN.DASHBOARD)
  }, [router])

  return null
}
