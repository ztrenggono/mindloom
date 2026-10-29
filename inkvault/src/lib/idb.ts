/** Minimal promise wrapper over one IndexedDB key/value store. Far roomier than localStorage's ~5 MB. */
const DB = 'inkvault'
const STORE = 'kv'

let dbp: Promise<IDBDatabase> | null = null

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbp = null
      reject(req.error)
    }
  })
  return dbp
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req ? req.result : undefined)
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      }),
  )
}

export const idbGet = <T>(key: string) => run<T>('readonly', (s) => s.get(key) as IDBRequest<T>)

/** Writes several keys in one transaction, so they never disagree after a crash. */
export const idbSetMany = (entries: Record<string, unknown>) =>
  run('readwrite', (s) => {
    for (const [k, v] of Object.entries(entries)) s.put(v, k)
  }).then(() => undefined)
