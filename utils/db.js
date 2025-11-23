const DB_NAME = 'VulnScannerDB';
const DB_VERSION = 1;

class VulnScannerDB {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log("IndexedDB initialized");
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Targets Store
                if (!db.objectStoreNames.contains('targets')) {
                    const targetStore = db.createObjectStore('targets', { keyPath: 'id', autoIncrement: true });
                    targetStore.createIndex('name', 'name', { unique: false });
                }

                // Scans Store
                if (!db.objectStoreNames.contains('scans')) {
                    const scanStore = db.createObjectStore('scans', { keyPath: 'id', autoIncrement: true });
                    scanStore.createIndex('targetId', 'targetId', { unique: false });
                    scanStore.createIndex('url', 'url', { unique: false });
                    scanStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    // --- Targets ---

    async createTarget(name, description = '') {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['targets'], 'readwrite');
            const store = transaction.objectStore('targets');
            const request = store.add({
                name,
                description,
                created_at: new Date().toISOString()
            });

            request.onsuccess = (event) => resolve(event.target.result); // Returns ID
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getAllTargets() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['targets'], 'readonly');
            const store = transaction.objectStore('targets');
            const request = store.getAll();

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async deleteTarget(id) {
        // Note: This should also cascade delete scans, but for simplicity we'll just delete the target for now.
        // Ideally, we query all scans with targetId and delete them too.
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['targets', 'scans'], 'readwrite');

            // Delete Target
            const targetStore = transaction.objectStore('targets');
            targetStore.delete(id);

            // Delete associated Scans
            const scanStore = transaction.objectStore('scans');
            const index = scanStore.index('targetId');
            const request = index.openCursor(IDBKeyRange.only(id));

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }

    // --- Scans ---

    async saveScan(targetId, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['scans'], 'readwrite');
            const store = transaction.objectStore('scans');
            const request = store.add({
                targetId,
                url: data.url || 'unknown', // Ensure URL is captured
                timestamp: new Date().toISOString(),
                data: data
            });

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getScansByTarget(targetId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['scans'], 'readonly');
            const store = transaction.objectStore('scans');
            const index = store.index('targetId');
            const request = index.getAll(IDBKeyRange.only(parseInt(targetId)));

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async deleteScan(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['scans'], 'readwrite');
            const store = transaction.objectStore('scans');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async deleteScans(ids) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['scans'], 'readwrite');
            const store = transaction.objectStore('scans');

            ids.forEach(id => {
                store.delete(id);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }
}

export const db = new VulnScannerDB();
