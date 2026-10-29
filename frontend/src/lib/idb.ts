/** Minimal promise wrapper over one IndexedDB key/value store. Far roomier than localStorage's ~5 MB. */
const DB = 'mindloom'
/** Database name before the rename from Inkvault; read as a fallback so existing local data survives. */
const LEGACY_DB = 'inkvault'
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

function readLegacy<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    // Opening a missing database would create an empty one, so check it exists first.
    indexedDB.databases().then((dbs) => {
      if (!dbs.some((d) => d.name === LEGACY_DB)) return resolve(undefined)
      const req = indexedDB.open(LEGACY_DB)
      req.onerror = () => resolve(undefined)
      req.onsuccess = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) return db.close(), resolve(undefined)
        const get = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
        get.onsuccess = () => (db.close(), resolve(get.result as T | undefined))
        get.onerror = () => (db.close(), resolve(undefined))
      }
    }, () => resolve(undefined))
  })
}

export const idbGet = async <T>(key: string) =>
  (await run<T>('readonly', (s) => s.get(key) as IDBRequest<T>)) ?? readLegacy<T>(key)

/** Writes several keys in one transaction, so they never disagree after a crash. */
export const idbSetMany = (entries: Record<string, unknown>) =>
  run('readwrite', (s) => {
    for (const [k, v] of Object.entries(entries)) s.put(v, k)
  }).then(() => undefined)
