'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'

export interface CityTenantInfo {
  slug: string
  displayName: string
  provinceSlug: string
}

const CityTenantContext = createContext<CityTenantInfo | null>(null)

function persistLocalTenantCookie(tenant: CityTenantInfo) {
  if (typeof document === 'undefined') return
  const host = window.location.hostname
  if (host !== '127.0.0.1' && host !== 'localhost' && !host.endsWith('.localhost')) return
  const year = 60 * 60 * 24 * 365
  document.cookie = `nahaber_tenant=${tenant.slug}; Path=/; Max-Age=${year}; SameSite=Lax`
  document.cookie = `nahaber_province=${tenant.provinceSlug}; Path=/; Max-Age=${year}; SameSite=Lax`
}

export function CityTenantProvider({
  tenant,
  children,
}: {
  tenant: CityTenantInfo | null
  children: ReactNode
}) {
  if (typeof document !== 'undefined' && tenant) {
    persistLocalTenantCookie(tenant)
  }

  useEffect(() => {
    if (tenant) persistLocalTenantCookie(tenant)
  }, [tenant])

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
