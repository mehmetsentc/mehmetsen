import { randomUUID } from 'node:crypto'

export function newUserId(prefix: 'ufa' = 'ufa'): string {
  return `${prefix}_${randomUUID()}`
}
