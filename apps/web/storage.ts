/**
 * 浏览器本地文档存储。
 *
 * 优先使用 IndexedDB（容量大、可存图片）；不可用时回退到 localStorage。
 * 当前采用单文档槽位：保存即覆盖上一次的浏览器文档。
 */

import type { PersistedView, Workbook } from '../../packages/core/src/types.ts';

export interface BrowserDocument {
  readonly fileName: string;
  readonly doc: Workbook;
  readonly view: PersistedView;
  readonly savedAt: number;
}

export type StorageTarget = 'indexeddb' | 'local';

const DB_NAME = 'weavemind';
const DB_VERSION = 1;
const STORE_NAME = 'documents';
const CURRENT_KEY = 'current';
const FALLBACK_KEY = 'weavemind.document.v1';

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/** 写入 localStorage 小型备份，失败时静默忽略。 */
function writeLocalBackup(payload: BrowserDocument): boolean {
  if (!hasLocalStorage()) return false;
  try {
    const text = JSON.stringify(payload);
    if (text.length >= 2_500_000) return false;
    localStorage.setItem(FALLBACK_KEY, text);
    return true;
  } catch {
    return false;
  }
}

export async function saveBrowserDocument(payload: BrowserDocument): Promise<StorageTarget> {
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(payload, CURRENT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('indexeddb write failed'));
        tx.onabort = () => reject(tx.error ?? new Error('indexeddb write aborted'));
      });
      // 小型文档额外写一份 localStorage 备份，提升跨环境恢复成功率
      writeLocalBackup(payload);
      return 'indexeddb';
    } catch {
      /* 回退到 localStorage */
    } finally {
      db.close();
    }
  }
  if (!writeLocalBackup(payload)) throw new Error('浏览器存储不可用或空间不足');
  return 'local';
}

export async function loadBrowserDocument(): Promise<BrowserDocument | null> {
  let indexed: BrowserDocument | null = null;
  const db = await openDatabase();
  if (db) {
    try {
      indexed = await new Promise<BrowserDocument | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(CURRENT_KEY);
        request.onsuccess = () => resolve((request.result as BrowserDocument | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error('indexeddb read failed'));
      });
    } catch {
      /* 回退到 localStorage */
    } finally {
      db.close();
    }
  }

  let local: BrowserDocument | null = null;
  if (hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      if (raw) local = JSON.parse(raw) as BrowserDocument;
    } catch {
      local = null;
    }
  }

  if (indexed && local) return (indexed.savedAt ?? 0) >= (local.savedAt ?? 0) ? indexed : local;
  return indexed ?? local;
}

export async function clearBrowserDocument(): Promise<void> {
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(CURRENT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      /* 清理失败不影响新建流程 */
    } finally {
      db.close();
    }
  }
  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(FALLBACK_KEY);
    } catch {
      /* ignore */
    }
  }
}
