// 各 store 测试以独立 Node 进程运行：本文件先于 store 导入搭好最小浏览器环境
const memory = new Map<string, string>();
let storageFailures = 0;

class MemoryLocalStorage {
  get length() {
    return memory.size;
  }
  clear() {
    memory.clear();
  }
  getItem(key: string) {
    return memory.has(key) ? memory.get(key)! : null;
  }
  key(index: number) {
    return Array.from(memory.keys())[index] ?? null;
  }
  removeItem(key: string) {
    memory.delete(key);
  }
  setItem(key: string, value: string) {
    if (storageFailures > 0) {
      storageFailures -= 1;
      throw new Error("quota exceeded");
    }
    memory.set(key, String(value));
  }
}

export function setupBrowserEnv() {
  const localStorage = new MemoryLocalStorage();
  Object.assign(globalThis, {
    localStorage,
    window: { localStorage, setTimeout, clearTimeout },
  });
  return {
    failNextWrite: (count = 1) => {
      storageFailures = count;
    },
  };
}
