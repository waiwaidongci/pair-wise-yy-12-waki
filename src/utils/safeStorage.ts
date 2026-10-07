import type { StateStorage } from "zustand/middleware";

export interface PersistStatus {
  error: string | null;
  pending: boolean;
  lastFailedAt: string | null;
}

type StatusListener = (status: PersistStatus) => void;

export interface SafeStorage {
  storage: StateStorage;
  /** 重试所有落盘失败的写入；整份状态整体替换，不会重复追加 */
  retry: () => void;
  getStatus: () => PersistStatus;
  /** 演示用：让下一次写入模拟失败一次 */
  armFailure: () => void;
  subscribe: (listener: StatusListener) => () => void;
}

/**
 * 包装 localStorage 的安全存储：
 * - 写入失败时上一版内容保留不动（localStorage 与内存中的 last-good 都不覆盖）
 * - 失败写入进入 pending，稍后整体重试，setItem 是整份替换，重试不会重复追加
 */
export function createSafeStorage(): SafeStorage {
  const lastGood = new Map<string, string>();
  const pending = new Map<string, string>();
  let armed = false;
  let status: PersistStatus = { error: null, pending: false, lastFailedAt: null };
  const listeners = new Set<StatusListener>();

  const emit = () => listeners.forEach((listener) => listener(status));
  const setStatus = (patch: Partial<PersistStatus>) => {
    status = { ...status, ...patch };
    emit();
  };

  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key) lastGood.set(key, localStorage.getItem(key) ?? "");
    }
  } catch {
    /* localStorage 不可用时仅依赖内存 */
  }

  const commit = (name: string, value: string): boolean => {
    try {
      localStorage.setItem(name, value);
      lastGood.set(name, value);
      pending.delete(name);
      return true;
    } catch (error) {
      // 失败：不覆盖 lastGood，上一版留着
      pending.set(name, value);
      setStatus({
        error: error instanceof Error ? error.message : String(error),
        pending: true,
        lastFailedAt: new Date().toISOString(),
      });
      return false;
    }
  };

  const storage: StateStorage = {
    getItem: (name) => {
      try {
        const value = localStorage.getItem(name);
        if (value !== null) {
          lastGood.set(name, value);
          return value;
        }
      } catch {
        /* 落盘读取失败时回退到内存中的上一版 */
      }
      return lastGood.get(name) ?? null;
    },
    setItem: (name, value) => {
      if (armed) {
        armed = false;
        pending.set(name, value);
        setStatus({
          error: "模拟落盘失败：写入被拒绝，上一版内容已保留",
          pending: true,
          lastFailedAt: new Date().toISOString(),
        });
        return;
      }
      if (commit(name, value)) {
        setStatus({ error: null, pending: pending.size > 0, lastFailedAt: status.lastFailedAt });
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
      lastGood.delete(name);
      pending.delete(name);
    },
  };

  return {
    storage,
    retry: () => {
      const names = Array.from(pending.keys());
      for (const name of names) {
        const value = pending.get(name);
        if (value === undefined) continue;
        if (!commit(name, value)) return;
      }
      if (pending.size === 0) {
        setStatus({ error: null, pending: false, lastFailedAt: status.lastFailedAt });
      }
    },
    getStatus: () => status,
    armFailure: () => {
      armed = true;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
