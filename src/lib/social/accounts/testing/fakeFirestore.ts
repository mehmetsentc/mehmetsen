/**
 * Test-only in-memory Firestore (Admin SDK subset). Transactions are
 * serialized through a mutex, modelling Firestore's isolation for the
 * single-use / no-duplicate tests. Never used outside tests.
 */
type Data = Record<string, unknown>

class AlreadyExists extends Error {
  code = 6
  constructor(path: string) {
    super(`6 ALREADY_EXISTS: ${path}`)
  }
}
class NotFound extends Error {
  code = 5
  constructor(path: string) {
    super(`5 NOT_FOUND: ${path}`)
  }
}

export class FakeFirestore {
  readonly store = new Map<string, Data>()
  writes = 0
  /** Query executions (cost checks: no full-collection scans). */
  reads = 0
  private lock: Promise<unknown> = Promise.resolve()
  private autoId = 0

  collection(name: string) {
    return new FakeCollection(this, name)
  }

  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    const run = this.lock.then(async () => {
      const tx = new FakeTransaction(this)
      const result = await fn(tx)
      tx.commit()
      return result
    })
    this.lock = run.catch(() => undefined)
    return run
  }

  nextId(): string {
    this.autoId += 1
    return `auto-${this.autoId}`
  }

  docs(collection: string): Array<{ id: string; data: Data }> {
    const prefix = `${collection}/`
    return [...this.store.entries()]
      .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
      .map(([k, data]) => ({ id: k.slice(prefix.length), data }))
  }
}

class FakeCollection {
  constructor(private db: FakeFirestore, readonly name: string) {}
  doc(id: string) {
    return new FakeDocRef(this.db, `${this.name}/${id}`, id)
  }
  async add(data: Data) {
    const ref = this.doc(this.db.nextId())
    await ref.set(data)
    return ref
  }
  select() {
    return this
  }
  where(field: string, op: '==', value: unknown) {
    return new FakeQuery(this.db, this.name, [[field, op, value]], null)
  }
  limit(n: number) {
    return new FakeQuery(this.db, this.name, [], n)
  }
  async get() {
    return {
      docs: this.db.docs(this.name).map((d) => ({ id: d.id, data: () => structuredClone(d.data) })),
    }
  }
}

/** Equality-only query subset (where … == …, limit) — enough for ledger listings. */
class FakeQuery {
  constructor(
    private db: FakeFirestore,
    private name: string,
    private filters: Array<[string, '==', unknown]>,
    private max: number | null,
  ) {}
  where(field: string, op: '==', value: unknown) {
    if (op !== '==') throw new Error('FakeQuery: only == supported')
    return new FakeQuery(this.db, this.name, [...this.filters, [field, op, value]], this.max)
  }
  limit(n: number) {
    return new FakeQuery(this.db, this.name, this.filters, n)
  }
  async get() {
    this.db.reads += 1
    let docs = this.db.docs(this.name).filter((d) => this.filters.every(([f, , v]) => d.data[f] === v))
    if (this.max !== null) docs = docs.slice(0, this.max)
    return { docs: docs.map((d) => ({ id: d.id, data: () => structuredClone(d.data) })), size: docs.length, empty: docs.length === 0 }
  }
}

export class FakeDocRef {
  constructor(private db: FakeFirestore, readonly path: string, readonly id: string) {}
  async get() {
    const data = this.db.store.get(this.path)
    return { exists: data !== undefined, id: this.id, data: () => (data ? structuredClone(data) : undefined) }
  }
  async set(data: Data, opts?: { merge?: boolean }) {
    const prev = this.db.store.get(this.path)
    this.db.store.set(this.path, opts?.merge && prev ? { ...prev, ...structuredClone(data) } : structuredClone(data))
    this.db.writes += 1
  }
  async create(data: Data) {
    if (this.db.store.has(this.path)) throw new AlreadyExists(this.path)
    this.db.store.set(this.path, structuredClone(data))
    this.db.writes += 1
  }
  async update(data: Data) {
    const prev = this.db.store.get(this.path)
    if (!prev) throw new NotFound(this.path)
    this.db.store.set(this.path, { ...prev, ...structuredClone(data) })
    this.db.writes += 1
  }
}

class FakeTransaction {
  private ops: Array<() => void> = []
  constructor(private db: FakeFirestore) {}
  async get(ref: FakeDocRef) {
    return ref.get()
  }
  create(ref: FakeDocRef, data: Data) {
    this.ops.push(() => {
      if (this.db.store.has(ref.path)) throw new AlreadyExists(ref.path)
      this.db.store.set(ref.path, structuredClone(data))
      this.db.writes += 1
    })
    return this
  }
  update(ref: FakeDocRef, data: Data) {
    this.ops.push(() => {
      const prev = this.db.store.get(ref.path)
      if (!prev) throw new NotFound(ref.path)
      this.db.store.set(ref.path, { ...prev, ...structuredClone(data) })
      this.db.writes += 1
    })
    return this
  }
  set(ref: FakeDocRef, data: Data) {
    this.ops.push(() => {
      this.db.store.set(ref.path, structuredClone(data))
      this.db.writes += 1
    })
    return this
  }
  commit() {
    for (const op of this.ops) op()
  }
}
