import type { RevisionReport } from "./textRevision";

/**
 * 修订稿落盘与留档。
 * 关键保证：
 * - 先落盘后改内存：写入失败时上一版完整保留，内存状态不动；
 * - 写入按整条快照原子替换，失败不会留下半截内容；
 * - 同一修订（同任务、同来源版本、同新稿内容）重试只认第一次结果，不重复追加留档。
 */

export interface PersistedTextVersion {
  content: string;
  version: number;
  lastRevisionId?: string;
}

export interface RevisionArchiveEntry {
  idempotencyKey: string;
  revisionId: string;
  taskId: string;
  fromVersion: number;
  toVersion: number;
  oldContent: string;
  newContent: string;
  appliedAt: string;
  report: RevisionReport;
}

interface ArchiveState {
  tasks: Record<string, PersistedTextVersion>;
  entries: RevisionArchiveEntry[];
}

export interface CommitInput {
  revisionId: string;
  taskId: string;
  fromVersion: number;
  newContent: string;
  oldContent: string;
  report: RevisionReport;
}

export type CommitOutput =
  | { ok: true; entry: RevisionArchiveEntry; duplicated: boolean }
  | { ok: false; error: string };

const STORAGE_KEY = "text-revision-archive-v1";
const EMPTY_STATE: ArchiveState = { tasks: {}, entries: [] };

/** 稳定的非加密哈希，用于把“同一版修订”折成幂等键，中文内容同样适用 */
export function hashText(value: string): string {
  let hash1 = 0xdeadbeef ^ value.length;
  let hash2 = 0x41c6ce57 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    hash1 = Math.imul(hash1 ^ char, 2654435761);
    hash2 = Math.imul(hash2 ^ char, 1597334677);
  }
  hash1 = Math.imul(hash1 ^ (hash1 >>> 16), 2246822507) ^ Math.imul(hash2 ^ (hash2 >>> 13), 3266489909);
  hash2 = Math.imul(hash2 ^ (hash2 >>> 16), 2246822507) ^ Math.imul(hash1 ^ (hash1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & hash2) + (hash1 >>> 0)).toString(16);
}

export function idempotencyKeyFor(input: Pick<CommitInput, "taskId" | "fromVersion" | "newContent">): string {
  return `${input.taskId}|v${input.fromVersion}|${hashText(input.newContent)}`;
}

export interface RevisionArchive {
  read: () => ArchiveState;
  snapshot: () => Record<string, PersistedTextVersion>;
  listForTask: (taskId: string) => RevisionArchiveEntry[];
  latestForTask: (taskId: string) => RevisionArchiveEntry | undefined;
  commit: (input: CommitInput) => CommitOutput;
  /** 演练用：让接下来的 count 次写入失败 */
  failNextWrites: (count: number) => void;
}

export function createRevisionArchive(storage: Storage): RevisionArchive {
  let failCount = 0;

  const read = (): ArchiveState => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(EMPTY_STATE);
      const parsed = JSON.parse(raw) as Partial<ArchiveState>;
      return {
        tasks: parsed.tasks ?? {},
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      };
    } catch {
      // 存档损坏时不覆盖旧数据，但本次也无法安全追加
      return structuredClone(EMPTY_STATE);
    }
  };

  const latestForTask = (taskId: string): RevisionArchiveEntry | undefined => {
    const entries = read().entries.filter((entry) => entry.taskId === taskId);
    return entries.length ? entries[entries.length - 1] : undefined;
  };

  const commit = (input: CommitInput): CommitOutput => {
    const key = idempotencyKeyFor(input);
    const current = read();

    // 完全相同的提交（含来源版本）重试：直接认第一次留档
    const sameEntry = current.entries.find((entry) => entry.idempotencyKey === key);
    if (sameEntry) return { ok: true, entry: sameEntry, duplicated: true };

    // 成功送达后再次以同一新稿重试（此时来源版本已前移）：按最新落档判重，不重复追加
    const latest = current.entries.length
      ? current.entries.filter((entry) => entry.taskId === input.taskId).at(-1)
      : undefined;
    if (latest && latest.newContent === input.newContent) {
      return { ok: true, entry: latest, duplicated: true };
    }

    const entry: RevisionArchiveEntry = {
      idempotencyKey: key,
      revisionId: input.revisionId,
      taskId: input.taskId,
      fromVersion: input.fromVersion,
      toVersion: input.fromVersion + 1,
      oldContent: input.oldContent,
      newContent: input.newContent,
      appliedAt: new Date().toISOString(),
      report: input.report,
    };

    const nextState: ArchiveState = {
      tasks: {
        ...current.tasks,
        [input.taskId]: {
          content: input.newContent,
          version: input.fromVersion + 1,
          lastRevisionId: input.revisionId,
        },
      },
      entries: [...current.entries, entry],
    };

    // 原子替换：setItem 抛错（配额/演练故障）时，键上仍是上一版
    if (failCount > 0) {
      failCount -= 1;
      return { ok: false, error: "模拟的存储写入失败" };
    }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    return { ok: true, entry, duplicated: false };
  };

  return {
    read,
    snapshot: () => read().tasks,
    listForTask: (taskId) => read().entries.filter((entry) => entry.taskId === taskId),
    latestForTask,
    commit,
    failNextWrites: (count) => {
      failCount = Math.max(0, count);
    },
  };
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const browserStorage = defaultStorage();

/** 无 localStorage 环境（如测试壳）下退化为纯内存，保证调用不崩 */
const fallbackStorage: Storage = (() => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => map.set(key, String(value)),
  };
})();

export const revisionArchive = createRevisionArchive(browserStorage ?? fallbackStorage);
