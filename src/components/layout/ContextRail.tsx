'use client'

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import { cn } from '@/lib/utils'

export const CONTEXT_RAIL_SLOT_ID = 'nahaber-context-rail'

export const CONTEXT_RAIL_CHIP =
  'context-rail__chip relative flex min-h-8 shrink-0 items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold leading-none whitespace-nowrap touch-manipulation transition-colors duration-150 select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80'

export const CONTEXT_RAIL_CHIP_ACTIVE = 'bg-white text-black shadow-sm'
export const CONTEXT_RAIL_CHIP_IDLE =
  'bg-transparent text-white/72 hover:text-white'

export function contextRailChipClass(active: boolean): string {
  return cn(
    CONTEXT_RAIL_CHIP,
    active ? CONTEXT_RAIL_CHIP_ACTIVE : CONTEXT_RAIL_CHIP_IDLE
  )
}

type SlotCtx = {
  element: HTMLElement | null
  setElement: (el: HTMLElement | null) => void
}

const ContextRailSlotContext = createContext<SlotCtx>({
  element: null,
  setElement: () => {},
})

export function ContextRailSlotProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null)
  return (
    <ContextRailSlotContext.Provider value={{ element, setElement }}>
      {children}
    </ContextRailSlotContext.Provider>
  )
}

export function useContextRailSlot() {
  return useContext(ContextRailSlotContext)
}

/** Navbar host for the Akış Level-2 rail (mobile overlay chrome). */
export function ContextRailSlot({ className }: { className?: string }) {
  const { setElement } = useContextRailSlot()
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      setElement(node)
    },
    [setElement]
  )
  return (
    <div
      ref={ref}
      id={CONTEXT_RAIL_SLOT_ID}
      className={cn('context-rail-slot', className)}
      data-testid="context-rail-slot"
    />
  )
}

interface ContextRailProps {
  children: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  ariaLabel: string
  testId?: string
  scrollRef?: Ref<HTMLDivElement>
  className?: string
}

/** Shared Level-2 context rail presentation. Semantics stay with the caller. */
export function ContextRail({
  children,
  leading,
  trailing,
  ariaLabel,
  testId,
  scrollRef,
  className,
}: ContextRailProps) {
  return (
    <nav
      className={cn('context-rail', className)}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {leading}
      <div
        ref={scrollRef}
        className="context-rail__scroller"
        role="tablist"
        data-no-category-swipe
      >
        {children}
      </div>
      {trailing ? <div className="context-rail__trailing">{trailing}</div> : null}
    </nav>
  )
}
