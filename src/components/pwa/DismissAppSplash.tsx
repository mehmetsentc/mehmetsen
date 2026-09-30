'use client'

import { useEffect, useState } from 'react'

/**
 * Launch logo. React must unmount this node itself.
 * Removing it with element.remove() desyncs the root fiber and the next
 * navigation throws into the root error screen.
 */
export function DismissAppSplash() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(false)
  }, [])

  if (!visible) return null

  return (
    <div
      id="app-splash"
      role="status"
      aria-label="NaHaber yükleniyor"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#070b16',
      }}
    >
      <img
        src="/brand/splash-mark.png"
        alt=""
        width={160}
        height={160}
        style={{ width: 160, height: 160, background: 'transparent' }}
      />
    </div>
  )
}
