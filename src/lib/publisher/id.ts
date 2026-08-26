import { randomUUID } from 'node:crypto'

export function newPublisherId(prefix: 'pub' | 'psrc' | 'pmem' | 'pclaim' = 'pub'): string {
  return `${prefix}_${randomUUID()}`
}
