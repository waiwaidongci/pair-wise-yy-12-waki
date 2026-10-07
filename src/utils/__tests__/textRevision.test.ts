import { strict as assert } from "node:assert";
import { test } from "node:test";
import type {
  Annotation,
  ReviewConflict,
  ReviewCandidate,
  TextSpanAnnotation,
} from "../../types/annotation";
import {
  migrateSpanAnnotations,
  recomputeReviewConflicts,
  relocateByText,
  type CandidateComputer,
} from "../textRevision";
import { createRevisionArchive, idempotencyKeyFor } from "../revisionArchive";

const P1 = "第一句Alpha。";
const P2 = "第二句Beta在中间。";
const P3 = "第三句Gamma收尾。";
const OLD = [P1, P2, P3].join("\n\n");
const REV = "rev-test-0001";

function span(partial: Partial<TextSpanAnnotation> & Pick<TextSpanAnnotation, "id" | "start" | "end" | "anchorText">): TextSpanAnnotation {
  return {
    taskId: "t1",
    kind: "text-span",
    scope: "span",
    labelId: "negative",
    author: "何序",
    createdAt: "2026-10-07T00:00:00.000Z",
    confidence: 0.9,
    anchorStatus: "anchored",
    ...partial,
  };
}

function makeStorage() {
  const map = new Map<string, string>();
  let failures = 0;
  const storage: Storage = {
    length: 0,
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error("quota exceeded");
      }
      map.set(key, String(value));
    },
  };
  return {
    storage,
    failNext: (count: number) => {
      failures = count;
    },
    raw: () => map,
  };
}

test("句子前后调换：区间按原对应文字挪到新位置，不依赖旧字符偏移", () => {
  const annotations: Annotation[] = [
    span({ id: "s1", start: OLD.indexOf(P2), end: OLD.indexOf(P2) + P2.length, anchorText: P2 }),
    span({ id: "s2", start: OLD.indexOf(P3), end: OLD.indexOf(P3) + P3.length, anchorText: P3 }),
  ];
  const reordered = [P3, P2, P1].join("\n\n");
  const { annotations: next, moved, dangled } = migrateSpanAnnotations(annotations, "t1", OLD, reordered, REV);
  assert.deepEqual(moved, ["s1", "s2"]);
  assert.deepEqual(dangled, []);
  const byId = new Map(next.map((a) => [a.id, a as TextSpanAnnotation]));
  assert.equal(byId.get("s1")!.start, reordered.indexOf(P2));
  assert.equal(byId.get("s1")!.end, reordered.indexOf(P2) + P2.length);
  assert.equal(byId.get("s2")!.start, reordered.indexOf(P3));
  assert.equal(byId.get("s2")!.anchorStatus, "anchored");
  assert.equal(byId.get("s2")!.anchoredByRevision, REV);
  // 新位置覆盖的确实是原先那段文字
  assert.equal(reordered.slice(byId.get("s1")!.start, byId.get("s1")!.end), P2);
});

test("插入句子：位置随偏移平移；位置未变的区间不记入 moved", () => {
  const inserted = `导语开头。\n\n${OLD}`;
  const annotations: Annotation[] = [
    span({ id: "s1", start: OLD.indexOf(P1), end: OLD.indexOf(P1) + P1.length, anchorText: P1 }),
  ];
  const { annotations: next, moved } = migrateSpanAnnotations(annotations, "t1", OLD, inserted, REV);
  const s1 = next[0] as TextSpanAnnotation;
  assert.equal(s1.start, inserted.indexOf(P1));
  assert.deepEqual(moved, ["s1"]);
});

test("整段被拿掉：区间不删除，标悬空并记录修订批次留档", () => {
  const removed = [P1, P3].join("\n\n"); // P2 所在整段被拿掉
  const annotations: Annotation[] = [
    span({ id: "s1", start: OLD.indexOf(P2), end: OLD.indexOf(P2) + P2.length, anchorText: P2 }),
    span({ id: "s2", start: OLD.indexOf(P3), end: OLD.indexOf(P3) + P3.length, anchorText: P3 }),
  ];
  const { annotations: next, dangled } = migrateSpanAnnotations(annotations, "t1", OLD, removed, REV);
  assert.deepEqual(dangled, ["s1"]);
  const byId = new Map(next.map((a) => [a.id, a as TextSpanAnnotation]));
  assert.equal(next.length, 2, "悬空区间必须保留，不能丢");
  assert.equal(byId.get("s1")!.anchorStatus, "dangling");
  assert.equal(byId.get("s1")!.dangledByRevision, REV);
  assert.equal(byId.get("s1")!.anchorText, P2, "原文留档可查");
  assert.equal(byId.get("s2")!.anchorStatus, "anchored");
});

test("同一段文字多处出现时，优先挪到离旧位置最近的一处", () => {
  const repeated = [P2, P1, P2, P3].join("\n\n");
  // 旧位置靠后（30），两个候选 0 与 24 中应选更近的 24，而非第一处
  const relocated = relocateByText(repeated, P2, 30);
  assert.ok(relocated);
  assert.equal(relocated.start, 24);
  assert.equal(relocated.end, 24 + P2.length);
});

function conflict(partial: Partial<ReviewConflict> & Pick<ReviewConflict, "id">): ReviewConflict {
  return {
    taskId: "t1",
    target: "测试冲突",
    severity: "一般",
    status: "待处理",
    evidenceText: P2,
    candidates: [
      { id: "c1", author: "何序", labelId: "negative", value: "负向", confidence: 0.9, status: "active" },
      { id: "c2", author: "周岚", labelId: "request", value: "诉求", confidence: 0.8, status: "active" },
    ],
    ...partial,
  };
}

test("依据文字被移除：候选直接失效；已确认的冲突退回待处理", () => {
  const removed = [P1, P3].join("\n\n");
  const initial = [conflict({ id: "cf1", status: "已确认" })];
  const { conflicts, invalidatedCandidates, reopenedConflicts } = recomputeReviewConflicts(initial, "t1", removed, REV);
  assert.deepEqual(new Set(invalidatedCandidates), new Set(["c1", "c2"]));
  assert.deepEqual(reopenedConflicts, ["cf1"]);
  const next = conflicts[0];
  assert.equal(next.status, "待处理");
  assert.ok(next.candidates.every((c: ReviewCandidate) => c.status === "invalidated"));
  assert.ok(next.candidates.every((c: ReviewCandidate) => c.invalidatedByRevision === REV));
});

test("依据仍在但有重算器：旧候选失效留档，新稿件重算候选接续", () => {
  const reordered = [P3, P2, P1].join("\n\n");
  const computer: CandidateComputer = () => [
    {
      conflictId: "cf1",
      target: "重算后的目标",
      evidenceText: P2,
      candidates: [
        { author: "新算法", labelId: "neutral", value: "重算中性", confidence: 0.66 },
      ],
    },
  ];
  const initial = [conflict({ id: "cf1" })];
  const result = recomputeReviewConflicts(initial, "t1", reordered, REV, computer);
  const next = result.conflicts[0];
  assert.equal(next.target, "重算后的目标");
  assert.equal(next.recomputedByRevision, REV);
  const actives = next.candidates.filter((c) => c.status !== "invalidated");
  assert.equal(actives.length, 1);
  assert.equal(actives[0].author, "新算法");
  assert.equal(actives[0].recomputed, true);
  // 旧候选留档但失效
  assert.equal(next.candidates.filter((c) => c.status === "invalidated").length, 2);
  assert.equal(result.recomputedCandidates.length, 1);
});

test("已确认且依据仍在：不退回待处理", () => {
  const result = recomputeReviewConflicts([conflict({ id: "cf1", status: "已确认" })], "t1", OLD, REV);
  assert.equal(result.conflicts[0].status, "已确认");
  assert.deepEqual(result.reopenedConflicts, []);
});

test("落盘失败：上一版完整保留；失败重试成功不产生重复条目", () => {
  const { storage, failNext, raw } = makeStorage();
  const archive = createRevisionArchive(storage);

  const report1 = {
    revisionId: "rev-1",
    taskId: "t1",
    oldVersion: 0,
    newVersion: 1,
    moved: [],
    dangled: [],
    invalidatedCandidates: [],
    recomputedCandidates: [],
    reopenedConflicts: [],
  };

  // 第一次写入失败
  failNext(1);
  const failed = archive.commit({
    revisionId: "rev-1",
    taskId: "t1",
    fromVersion: 0,
    oldContent: OLD,
    newContent: "第一次修订",
    report: report1,
  });
  assert.equal(failed.ok, false);
  assert.equal(raw().size, 0, "写入失败时键不存在，上一版（空）原样保留，无半截数据");

  // 立即重试同一份修订：成功且只有一条留档
  const retried = archive.commit({
    revisionId: "rev-1",
    taskId: "t1",
    fromVersion: 0,
    oldContent: OLD,
    newContent: "第一次修订",
    report: report1,
  });
  assert.equal(retried.ok, true);
  const stateAfterRetry = archive.read();
  assert.equal(stateAfterRetry.entries.length, 1);
  assert.equal(stateAfterRetry.tasks["t1"].content, "第一次修订");
  assert.equal(stateAfterRetry.tasks["t1"].version, 1);

  // 再重试一次同一修订（即便调用方重复发起）：幂等，不重复追加
  const duplicate = archive.commit({
    revisionId: "rev-1",
    taskId: "t1",
    fromVersion: 0,
    oldContent: OLD,
    newContent: "第一次修订",
    report: report1,
  });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicated, true);
  assert.equal(archive.read().entries.length, 1);
  assert.equal(archive.read().tasks["t1"].version, 1, "版本号不能因重试重复递增");

  // 不同新稿（下一版）正常追加为第二条
  const report2 = { ...report1, revisionId: "rev-2", oldVersion: 1, newVersion: 2 };
  const second = archive.commit({
    revisionId: "rev-2",
    taskId: "t1",
    fromVersion: 1,
    oldContent: "第一次修订",
    newContent: "第二次修订",
    report: report2,
  });
  assert.equal(second.ok, true);
  assert.equal(archive.read().entries.length, 2);
  assert.equal(archive.read().tasks["t1"].content, "第二次修订");
});

test("第二版落盘失败时，第一版稿件继续可用", () => {
  const { storage, failNext } = makeStorage();
  const archive = createRevisionArchive(storage);
  const report = (revisionId: string, oldVersion: number, newVersion: number) => ({
    revisionId, taskId: "t1", oldVersion, newVersion, moved: [], dangled: [],
    invalidatedCandidates: [], recomputedCandidates: [], reopenedConflicts: [],
  });

  archive.commit({ revisionId: "rev-1", taskId: "t1", fromVersion: 0, oldContent: OLD, newContent: "v1内容", report: report("rev-1", 0, 1) });
  assert.equal(archive.snapshot()["t1"].content, "v1内容");

  failNext(1);
  const failed = archive.commit({ revisionId: "rev-2", taskId: "t1", fromVersion: 1, oldContent: "v1内容", newContent: "v2内容", report: report("rev-2", 1, 2) });
  assert.equal(failed.ok, false);
  // 上一版仍在
  assert.equal(archive.snapshot()["t1"].content, "v1内容");
  assert.equal(archive.snapshot()["t1"].version, 1);
  assert.equal(archive.read().entries.length, 1);
});

test("幂等键对相同内容稳定、对不同内容可区分", () => {
  const base = { taskId: "t1", fromVersion: 1, newContent: "同稿" };
  assert.equal(idempotencyKeyFor(base), idempotencyKeyFor({ ...base }));
  assert.notEqual(idempotencyKeyFor(base), idempotencyKeyFor({ ...base, newContent: "异稿" }));
  assert.notEqual(idempotencyKeyFor(base), idempotencyKeyFor({ ...base, fromVersion: 2 }));
});
