import type { LibraryFilter, LibraryItem, LibrarySort } from './types'

export function filterLibrary(
  items: LibraryItem[],
  input: { query: string; filter: LibraryFilter; sort: LibrarySort }
): LibraryItem[] {
  const query = input.query.trim().toLocaleLowerCase('tr')
  let next = items.filter((item) => {
    if (input.filter !== 'all' && !item.flags.includes(input.filter)) return false
    if (!query) return true
    return (
      item.title.toLocaleLowerCase('tr').includes(query) ||
      item.source.toLocaleLowerCase('tr').includes(query)
    )
  })
  next = next.slice().sort((a, b) => {
    if (input.sort === 'name') return a.title.localeCompare(b.title, 'tr')
    if (input.sort === 'size') return b.sizeBytes - a.sizeBytes
    if (input.sort === 'oldest') return a.createdAt - b.createdAt
    return b.createdAt - a.createdAt
  })
  return next
}
