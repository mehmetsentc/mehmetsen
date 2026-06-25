/**
 * react-hot-toast → sonner drop-in adapter — F2.5
 *
 * Geçmişte 46+ dosyada `import toast from 'react-hot-toast'` kullanılıyor.
 * Hepsini tek tek refactor etmek yerine tsconfig path alias ile bu modül'e
 * yönlendiriyoruz; arkada `sonner` (NaHaber design tokens'a entegre) çağırıyor.
 *
 * Sürdürülebilirlik:
 *   - Drop-in: react-hot-toast'un default export'u (fonksiyon + .success/.error/...)
 *   - Geri uyumlu: opts param'ı yutulur (style, position, icon vs.)
 *   - Sonner ID döner — toast.dismiss(id) çalışır.
 *
 * Yeni componentler doğrudan `@/components/ui/Toast`'tan import etmeli;
 * bu shim sadece legacy import path'leri yaşatmak için.
 */
import { toast as sonnerToast } from 'sonner'
import type { ReactNode } from 'react'

interface LegacyToastOptions {
  id?: string
  duration?: number
  /** react-hot-toast'un position/icon/style alanları yutulur — sonner global yapılandırılır */
  position?: string
  icon?: ReactNode
  style?: Record<string, unknown>
  className?: string
  iconTheme?: { primary?: string; secondary?: string }
  ariaProps?: { role?: string; 'aria-live'?: string }
}

type LegacyMessage = ReactNode | ((props: { id: string }) => ReactNode)

function asText(msg: LegacyMessage): string {
  // sonner accepts ReactNode → just cast; render-as-function variants becomes "[function]" string
  // but the function form is exceedingly rare in this codebase, so we serialize safely.
  if (typeof msg === 'function') {
    try {
      // Best-effort: call with empty id, expect a string
      const out = (msg as (p: { id: string }) => ReactNode)({ id: 'na' })
      return (out as unknown as string) ?? ''
    } catch {
      return ''
    }
  }
  return msg as unknown as string
}

function toSonnerOpts(opts?: LegacyToastOptions) {
  if (!opts) return undefined
  return {
    id: opts.id,
    duration: opts.duration,
  }
}

/** Default toast — react-hot-toast `toast()` call'u */
function defaultToast(message: LegacyMessage, opts?: LegacyToastOptions): string {
  const id = sonnerToast(asText(message), toSonnerOpts(opts))
  return String(id)
}

/** Drop-in API surface */
const api = Object.assign(defaultToast, {
  success: (message: LegacyMessage, opts?: LegacyToastOptions): string =>
    String(sonnerToast.success(asText(message), toSonnerOpts(opts))),

  error: (message: LegacyMessage, opts?: LegacyToastOptions): string =>
    String(sonnerToast.error(asText(message), toSonnerOpts(opts))),

  loading: (message: LegacyMessage, opts?: LegacyToastOptions): string =>
    String(sonnerToast.loading(asText(message), toSonnerOpts(opts))),

  custom: (message: LegacyMessage, opts?: LegacyToastOptions): string =>
    String(sonnerToast(asText(message), toSonnerOpts(opts))),

  dismiss: (id?: string): void => {
    sonnerToast.dismiss(id)
  },

  promise: <T,>(
    promise: Promise<T>,
    msgs: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((err: unknown) => string)
    }
  ): Promise<T> => {
    sonnerToast.promise(promise, msgs)
    return promise
  },
})

/** Backwards-compat for `import { Toaster } from 'react-hot-toast'` — no-op
 * because the real <ToastViewport /> is already mounted in the root layout. */
export function Toaster(): null {
  return null
}

export { api as toast }
export default api
