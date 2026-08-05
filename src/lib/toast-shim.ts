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
  id?: string | number
  duration?: number
  /** react-hot-toast'un position/icon/style alanları yutulur — sonner global yapılandırılır */
  position?: string
  icon?: ReactNode
  style?: Record<string, unknown>
  className?: string
  iconTheme?: { primary?: string; secondary?: string }
  ariaProps?: { role?: string; 'aria-live'?: string }
}

type ToastId = string | number
type LegacyMessage = ReactNode | ((props: { id: string }) => ReactNode)

function asText(msg: LegacyMessage): string {
  if (typeof msg === 'function') {
    try {
      const out = (msg as (p: { id: string }) => ReactNode)({ id: 'na' })
      return (out as unknown as string) ?? ''
    } catch {
      return ''
    }
  }
  return msg as unknown as string
}

const DEFAULT_DURATION_MS = 4000

function toSonnerOpts(
  opts?: LegacyToastOptions,
  /** Explicit default so loading→success/error same-id updates always auto-dismiss */
  defaultDuration?: number
) {
  const duration = opts?.duration ?? defaultDuration
  if (!opts && duration === undefined) return undefined
  return {
    id: opts?.id,
    ...(duration !== undefined ? { duration } : {}),
  }
}

/** Default toast — react-hot-toast `toast()` call'u */
function defaultToast(message: LegacyMessage, opts?: LegacyToastOptions): ToastId {
  return sonnerToast(asText(message), toSonnerOpts(opts, DEFAULT_DURATION_MS))
}

/** Drop-in API surface */
const api = Object.assign(defaultToast, {
  success: (message: LegacyMessage, opts?: LegacyToastOptions): ToastId =>
    sonnerToast.success(asText(message), toSonnerOpts(opts, DEFAULT_DURATION_MS)),

  error: (message: LegacyMessage, opts?: LegacyToastOptions): ToastId =>
    sonnerToast.error(asText(message), toSonnerOpts(opts, DEFAULT_DURATION_MS)),

  loading: (message: LegacyMessage, opts?: LegacyToastOptions): ToastId =>
    sonnerToast.loading(asText(message), toSonnerOpts(opts)),

  custom: (message: LegacyMessage, opts?: LegacyToastOptions): ToastId =>
    sonnerToast(asText(message), toSonnerOpts(opts, DEFAULT_DURATION_MS)),

  dismiss: (id?: ToastId): void => {
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
