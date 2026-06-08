import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface ProfileLinkProps {
  username: string
  children: React.ReactNode
  className?: string
}

export function ProfileLink({ username, children, className }: ProfileLinkProps) {
  if (!username?.trim()) return <span className={className}>{children}</span>

  return (
    <Link href={ROUTES.PROFILE(username)} className={cn('hover:text-blue-600', className)}>
      {children}
    </Link>
  )
}
