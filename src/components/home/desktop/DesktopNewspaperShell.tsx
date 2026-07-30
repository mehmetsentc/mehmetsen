'use client'

import { cn } from '@/lib/utils'

interface DesktopNewspaperShellProps {
  children: React.ReactNode
  /** Optional full-bleed band above main+rail (masthead, featured, …). */
  top?: React.ReactNode
  rail?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/**
 * Desktop gazete kabuğu — content-main genişliğini birebir doldurur
 * (iç içe max-width yok). `top` ve `footer` rail varken de tam genişlik kaplar.
 */
export function DesktopNewspaperShell({
  children,
  top,
  rail,
  footer,
  className,
}: DesktopNewspaperShellProps) {
  return (
    <div
      className={cn(
        'desktop-newspaper-shell',
        rail && 'desktop-newspaper-shell--with-rail',
        className
      )}
    >
      {top ? <div className="desktop-newspaper-shell-top min-w-0">{top}</div> : null}
      <div className="desktop-newspaper-main min-w-0">{children}</div>
      {rail ? <div className="desktop-newspaper-rail hidden xl:block">{rail}</div> : null}
      {footer ? <div className="desktop-newspaper-shell-footer">{footer}</div> : null}
    </div>
  )
}
