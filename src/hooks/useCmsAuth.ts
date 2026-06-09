'use client'

import { useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getCmsRole, canAccessCms, userCan, userCanAny, isSuperAdminEmail, isAtLeast } from '@/lib/cmsAuth'
import type { CmsRole, CmsPermission } from '@/types/cms'
import { CMS_ROLE_LABELS } from '@/types/cms'

export interface CmsAuthState {
  user: ReturnType<typeof useAuth>['user']
  loading: boolean
  role: CmsRole
  roleLabel: string
  isStaff: boolean
  isSuperAdmin: boolean
  can: (permission: CmsPermission) => boolean
  canAny: (permissions: CmsPermission[]) => boolean
  atLeast: (minRole: CmsRole) => boolean
}

export function useCmsAuth(): CmsAuthState {
  const { user, loading } = useAuth()

  return useMemo(() => {
    const role = getCmsRole(user)
    const isStaff = canAccessCms(user)
    const isSuperAdmin = isSuperAdminEmail(user?.email)

    return {
      user,
      loading,
      role,
      roleLabel: CMS_ROLE_LABELS[role],
      isStaff,
      isSuperAdmin,
      can: (permission: CmsPermission) => userCan(user, permission),
      canAny: (permissions: CmsPermission[]) => userCanAny(user, permissions),
      atLeast: (minRole: CmsRole) => isAtLeast(user, minRole),
    }
  }, [user, loading])
}
