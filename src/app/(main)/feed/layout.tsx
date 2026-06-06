export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 bg-black lg:left-56 lg:right-0 lg:top-0">
      {children}
    </div>
  )
}
