import type { UploadedBackground } from '@shared/types';
import { generateId } from '@shared/types/defaults';

const DATABASE_NAME = 'prismi-backgrounds';
const DATABASE_VERSION = 1;
const STORE_NAME = 'assets';
const blobCache = new Map<string, Promise<Blob | null>>();

interface BackgroundRecord {
  id: string;
  blob: Blob;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open background storage'));
  });
}

export async function saveBackground(blob: Blob, file: Pick<File, 'name' | 'type'>, kind: UploadedBackground['kind']): Promise<UploadedBackground> {
  const asset = {
    id: generateId('background'),
    kind,
    mimeType: blob.type || file.type || 'application/octet-stream',
    name: file.name
  } satisfies UploadedBackground;
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ id: asset.id, blob } satisfies BackgroundRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to save background'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Failed to save background'));
    });
  } finally {
    database.close();
  }
  blobCache.set(asset.id, Promise.resolve(blob));
  return asset;
}

export async function getBackgroundBlob(id: string): Promise<Blob | null> {
  const cached = blobCache.get(id);
  if (cached) return cached;

  const read = readBackgroundBlob(id);
  blobCache.set(id, read);
  return read;
}

async function readBackgroundBlob(id: string): Promise<Blob | null> {
  const database = await openDatabase();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve((request.result as BackgroundRecord | undefined)?.blob ?? null);
      request.onerror = () => reject(request.error ?? new Error('Failed to read background'));
    });
  } finally {
    database.close();
  }
}

export async function deleteBackground(id: string): Promise<void> {
  blobCache.delete(id);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to delete background'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Failed to delete background'));
    });
  } finally {
    database.close();
  }
}
