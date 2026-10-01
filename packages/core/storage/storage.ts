import { Storage } from '../types';

export class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class LocalStorageAdapter implements Storage {
  async get(key: string): Promise<string | null> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn('LocalStorage get failed:', e);
    }
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn('LocalStorage set failed:', e);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('LocalStorage remove failed:', e);
    }
  }
}

export class OfficeStorageAdapter implements Storage {
  async get(key: string): Promise<string | null> {
    try {
      // OfficeRuntime.storage check
      const runtime = (globalThis as any).OfficeRuntime;
      if (runtime?.storage?.getItem) {
        return await runtime.storage.getItem(key);
      }
    } catch (e) {
      console.warn('OfficeRuntime.storage get failed, falling back:', e);
    }
    return new LocalStorageAdapter().get(key);
  }

  async set(key: string, value: string): Promise<void> {
    try {
      const runtime = (globalThis as any).OfficeRuntime;
      if (runtime?.storage?.setItem) {
        await runtime.storage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn('OfficeRuntime.storage set failed, falling back:', e);
    }
    await new LocalStorageAdapter().set(key, value);
  }

  async remove(key: string): Promise<void> {
    try {
      const runtime = (globalThis as any).OfficeRuntime;
      if (runtime?.storage?.removeItem) {
        await runtime.storage.removeItem(key);
        return;
      }
    } catch (e) {
      console.warn('OfficeRuntime.storage remove failed, falling back:', e);
    }
    await new LocalStorageAdapter().remove(key);
  }
}

export class GoogleDocsStorageAdapter implements Storage {
  async get(key: string): Promise<string | null> {
    try {
      const gscript = (globalThis as any).google?.script?.run;
      if (gscript && typeof (globalThis as any).getUserKeyRpc === 'function') {
        return new Promise((resolve) => {
          gscript.withSuccessHandler((res: string) => resolve(res)).getUserKeyRpc(key);
        });
      }
    } catch (e) {
      console.warn('Apps Script storage get failed, falling back:', e);
    }
    return new LocalStorageAdapter().get(key);
  }

  async set(key: string, value: string): Promise<void> {
    try {
      const gscript = (globalThis as any).google?.script?.run;
      if (gscript && typeof (globalThis as any).setUserKeyRpc === 'function') {
        return new Promise((resolve) => {
          gscript.withSuccessHandler(() => resolve()).setUserKeyRpc(key, value);
        });
      }
    } catch (e) {
      console.warn('Apps Script storage set failed, falling back:', e);
    }
    await new LocalStorageAdapter().set(key, value);
  }

  async remove(key: string): Promise<void> {
    await this.set(key, '');
  }
}

export function createHostStorage(host: 'word' | 'gdocs' | 'mock'): Storage {
  switch (host) {
    case 'word':
      return new OfficeStorageAdapter();
    case 'gdocs':
      return new GoogleDocsStorageAdapter();
    case 'mock':
    default:
      return typeof window !== 'undefined' && window.localStorage
        ? new LocalStorageAdapter()
        : new MemoryStorage();
  }
}
