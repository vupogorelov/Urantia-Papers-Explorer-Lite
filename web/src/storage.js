export function createLocalStorage() {
  let databasePromise;

  function openDatabase() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('ub-lite', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('state')) {
            request.result.createObjectStore('state', { keyPath: 'key' });
          }
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            databasePromise = null;
          };
          resolve(request.result);
        };
        request.onerror = () => reject(request.error ?? new Error('Не удалось открыть хранилище'));
        request.onblocked = () => reject(new Error('Открытие хранилища заблокировано другой вкладкой'));
      });
    }
    return databasePromise;
  }

  return {
    async read(key) {
      const database = await openDatabase();
      return new Promise((resolve, reject) => {
        const request = database.transaction('state', 'readonly').objectStore('state').get(key);
        request.onsuccess = () => resolve(request.result?.value ?? null);
        request.onerror = () => reject(request.error ?? new Error('Не удалось прочитать локальные данные'));
      });
    },
    async write(key, value) {
      const database = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('state', 'readwrite');
        transaction.objectStore('state').put({ key, value });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('Не удалось сохранить локальные данные'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Сохранение локальных данных отменено'));
      });
    },
    async close() {
      const database = await openDatabase();
      database.close();
      databasePromise = null;
    },
  };
}
