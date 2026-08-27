import { randomUUID } from 'node:crypto'

export function newCommercialId(
  prefix:
    | 'pi'
    | 'ptxn'
    | 'cle'
    | 'pearn'
    | 'ctxn'
    | 'caud' = 'pi'
): string {
  return `${prefix}_${randomUUID()}`
}
