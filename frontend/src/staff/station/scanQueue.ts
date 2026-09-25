/**
 * Durable queue of scan batches not yet confirmed by the server.
 * Survives network loss and page reloads; the server handles re-sends idempotently.
 */

export interface ScanBatch {
  batch: string;
  stationId: number;
  ids: number[];
  createdAt: number;
}

const DB_NAME = "physquest";
const STORE = "scanBatches";
const memory = new Map<string, ScanBatch>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "batch" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = fn(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export const scanQueue = {
  async put(batch: ScanBatch) {
    memory.set(batch.batch, batch);
    await run("readwrite", (s) => s.put(batch));
  },
  async remove(batchId: string) {
    memory.delete(batchId);
    await run("readwrite", (s) => s.delete(batchId));
  },
  async list(stationId: number): Promise<ScanBatch[]> {
    const stored = (await run<ScanBatch[]>("readonly", (s) => s.getAll())) ?? [];
    const merged = new Map(stored.map((b) => [b.batch, b]));
    memory.forEach((b, k) => merged.set(k, b));
    return [...merged.values()].filter((b) => b.stationId === stationId).sort((a, b) => a.createdAt - b.createdAt);
  },
};

export function newBatchId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
