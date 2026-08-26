import { randomUUID } from 'node:crypto'

export function newPublisherId(
  prefix: 'pub' | 'psrc' | 'pmem' | 'pclaim' | 'playout' | 'psec' | 'pitem' = 'pub'
): string {
  return `${prefix}_${randomUUID()}`
}
