'use client'

import { cn } from '@/lib/utils'

interface DesktopNewspaperShellProps {
  children: React.ReactNode
  rail?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/**
 * Desktop gazete sayfalarında tutarlı genişlik: ana sütun + isteğe bağlı sağ rail
 * xl+ ekranlarda rail sütunu tüm sayfa yüksekliğinde kalır (sticky içerik).
 * Footer varsa ana+rail toplam genişliğini kaplar.
 */
export function DesktopNewspaperShell({
  children,
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
      <div className="desktop-newspaper-main min-w-0">{children}</div>
      {rail ? <div className="desktop-newspaper-rail hidden xl:block">{rail}</div> : null}
      {footer ? <div className="desktop-newspaper-shell-footer">{footer}</div> : null}
    </div>
  )
}
