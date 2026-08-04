'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import toast from 'react-hot-toast'
import { LogIn, LogOut, Mail, Settings, Smartphone, UserPlus } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { useAuth } from '@/hooks/useAuth'
import { FOOTER_ACCOUNT_LINKS, type FooterLink } from '@/constants/siteLegalLinks'
import { ROUTES } from '@/constants/routes'

const ACCOUNT_ICONS: Record<string, typeof LogIn> = {
  'Giriş Yap': LogIn,
  'Kayıt Ol': UserPlus,
  'Çıkış Yap': LogOut,
  'Hesap Ayarları': Settings,
  'Mobil Uygulama': Smartphone,
  'İletişim Formu': Mail,
}

const AUTH_LABELS = new Set(['Giriş Yap', 'Kayıt Ol'])

const linkClassName =
  'inline-flex items-center gap-2 text-[13px] font-bold text-[rgb(var(--color-text))] transition-colors hover:underline'

function FooterAccountLinkItem({ link }: { link: FooterLink }) {
  const Icon = ACCOUNT_ICONS[link.label]

  if (link.external || link.href.startsWith('http')) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
        {link.label}
      </a>
    )
  }

  return (
    <Link href={link.href} className={linkClassName}>
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
      {link.label}
    </Link>
  )
}

export function FooterAccountLinks() {
  const { user, logout, loading } = useAuth()
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    setHydrated(true)
    setHasSession(Boolean(auth.currentUser))
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setHasSession(Boolean(firebaseUser))
    })
    return unsub
  }, [])

  const handleLogout = useCallback(async () => {
    await logout()
    toast.success('Çıkış yapıldı')
    router.push(ROUTES.FEED)
  }, [logout, router])

  const isLoggedIn = Boolean(user) || hasSession
  const showAuthLinks = hydrated && !loading

  const orderedLinks = useMemo(() => {
    const sharedLinks = FOOTER_ACCOUNT_LINKS.filter((link) => !AUTH_LABELS.has(link.label))
    const loginLink = FOOTER_ACCOUNT_LINKS.find((link) => link.label === 'Giriş Yap')
    const registerLink = FOOTER_ACCOUNT_LINKS.find((link) => link.label === 'Kayıt Ol')
    const settingsLink = FOOTER_ACCOUNT_LINKS.find((link) => link.label === 'Hesap Ayarları')
    const utilityLinks = sharedLinks.filter((link) => link.label !== 'Hesap Ayarları')

    if (!showAuthLinks) {
      return utilityLinks
    }

    if (isLoggedIn) {
      return settingsLink ? [settingsLink, ...utilityLinks] : utilityLinks
    }

    return [loginLink, registerLink, ...utilityLinks].filter(Boolean) as FooterLink[]
  }, [isLoggedIn, showAuthLinks])

  return (
    <>
      {showAuthLinks && isLoggedIn ? (
        <li>
          <button type="button" onClick={handleLogout} className={linkClassName}>
            <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Çıkış Yap
          </button>
        </li>
      ) : null}

      {orderedLinks.map((link) => (
        <li key={link.href}>
          <FooterAccountLinkItem link={link} />
        </li>
      ))}
    </>
  )
}
