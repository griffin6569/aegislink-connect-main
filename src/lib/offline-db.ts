// IndexedDB-based offline sync engine for AegisLink
const DB_NAME = 'aegislink_offline';
const DB_VERSION = 2;
const STORES = {
  incidents: 'incidents',
  evidence: 'evidence',
  syncQueue: 'sync_queue',
  meshMessages: 'mesh_messages',
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.incidents)) {
        db.createObjectStore(STORES.incidents, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.evidence)) {
        db.createObjectStore(STORES.evidence, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.syncQueue)) {
        const store = db.createObjectStore(STORES.syncQueue, { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.meshMessages)) {
        const store = db.createObjectStore(STORES.meshMessages, { keyPath: 'message_id' });
        store.createIndex('status', 'relay_status', { unique: false });
      }
    };
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put<T>(storeName: string, item: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function remove(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface SyncQueueItem {
  id?: number;
  type: 'incident' | 'evidence';
  action: 'create' | 'update' | 'delete';
  data: any;
  status: 'pending' | 'syncing' | 'failed';
  retries: number;
  createdAt: string;
  error?: string;
}

export const offlineDB = {
  // Incidents
  async saveIncident(incident: any) {
    await put(STORES.incidents, incident);
  },
  async getIncidents() {
    return getAll(STORES.incidents);
  },
  async removeIncident(id: string) {
    await remove(STORES.incidents, id);
  },

  // Sync Queue
  async addToSyncQueue(item: Omit<SyncQueueItem, 'id'>) {
    await put(STORES.syncQueue, item);
  },
  async getSyncQueue(): Promise<SyncQueueItem[]> {
    return getAll(STORES.syncQueue);
  },
  async updateSyncItem(item: SyncQueueItem) {
    await put(STORES.syncQueue, item);
  },
  async removeSyncItem(id: number) {
    await remove(STORES.syncQueue, id);
  },

  // Mesh Messages
  async saveMeshMessage(msg: any) {
    await put(STORES.meshMessages, msg);
  },
  async getMeshMessages() {
    return getAll(STORES.meshMessages);
  },
  async updateMeshMessage(msg: any) {
    await put(STORES.meshMessages, msg);
  },
  async removeMeshMessage(messageId: string) {
    await remove(STORES.meshMessages, messageId);
  },

  // Evidence
  async saveEvidence(evidence: any) {
    await put(STORES.evidence, evidence);
  },
  async getEvidence() {
    return getAll(STORES.evidence);
  },
};
