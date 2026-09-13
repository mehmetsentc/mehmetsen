import { randomUUID } from 'node:crypto'

export function newVideoLibraryId(
  prefix: 'vli' | 'vlc' | 'vlci' | 'vlj' = 'vli'
): string {
  return `${prefix}_${randomUUID()}`
}
