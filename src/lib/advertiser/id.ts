import { randomUUID } from 'node:crypto'

export function newAdvertiserId(
  prefix:
    | 'adv'
    | 'amem'
    | 'acamp'
    | 'acr'
    | 'abr'
    | 'abook'
    | 'maud' = 'adv'
): string {
  return `${prefix}_${randomUUID()}`
}
