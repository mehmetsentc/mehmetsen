'use client'

import { createContext, useContext, type ReactNode } from 'react'

export interface CityTenantInfo {
  slug: string
  displayName: string
  provinceSlug: string
}

const CityTenantContext = createContext<CityTenantInfo | null>(null)

export function CityTenantProvider({
  tenant,
  children,
}: {
  tenant: CityTenantInfo | null
  children: ReactNode
}) {
  return (
    <CityTenantContext.Provider value={tenant}>
      {children}
    </CityTenantContext.Provider>
  )
}

/**
 * Returns the active city tenant, or null when on the national site.
 */
export function useCityTenant(): CityTenantInfo | null {
  return useContext(CityTenantContext)
}
