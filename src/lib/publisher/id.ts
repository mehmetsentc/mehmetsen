import { randomUUID } from 'node:crypto'

export function newPublisherId(
  prefix:
    | 'pub'
    | 'psrc'
    | 'pmem'
    | 'pclaim'
    | 'playout'
    | 'psec'
    | 'pitem'
    | 'pcnt'
    | 'prev'
    | 'paud'
    | 'pad'
    | 'padaud'
    | 'pmad'
    | 'pacr'
    | 'paimp'
    | 'paclk'
    | 'pfa' = 'pub'
): string {
  return `${prefix}_${randomUUID()}`
}
