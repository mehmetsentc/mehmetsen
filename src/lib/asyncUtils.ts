const DEV = process.env.NODE_ENV === 'development'

export function devLog(scope: string, message: string, data?: unknown) {
  if (!DEV) return
  if (data !== undefined) {
    console.log(`[${scope}] ${message}`, data)
  } else {
    console.log(`[${scope}] ${message}`)
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}
