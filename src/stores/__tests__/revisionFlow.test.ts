import { strict as assert } from "node:assert";
import { test } from "node:test";
import { setupBrowserEnv } from "./_env";

setupBrowserEnv();
const { useWorkbenchStore } = await import("../workbenchStore");

test("句子调换→区间随文挪位；整段删除→候选失效、已确认退回待处理", () => {
  const useStore = useWorkbenchStore;
  const taskId = "text-001";
  const oldContent = useStore.getState().tasks.find((t) => t.id === taskId)!.content as string;

  const spansOf = () =>
    useStore
      .getState()
      .annotations.filter((a) => a.taskId === taskId && a.kind === "text-span" && a.scope === "span")
      .map((a) =>
        a.kind === "text-span"
          ? { id: a.id, start: a.start, end: a.end, status: a.anchorStatus, anchor: a.anchorText }
          : null,
      )
      .filter(Boolean);

  const target = spansOf()!.find((s) => s!.id === "ann-text-001-c")!;
  assert.equal(oldContent.slice(target!.start, target!.end), "希望帮忙核实");

  // 1) 前后调换：第 2 段与第 6 段交换
  const paragraphs = oldContent.split("\n\n");
  [paragraphs[1], paragraphs[5]] = [paragraphs[5], paragraphs[1]];
  const reordered = paragraphs.join("\n\n");
  const r1 = useStore.getState().applyTextRevision(taskId, reordered);
  assert.equal(r1.ok, true);
  assert.equal(useStore.getState().tasks.find((t) => t.id === taskId)!.content, reordered);

  const moved = spansOf()!.find((s) => s!.id === "ann-text-001-c")!;
  assert.equal(reordered.slice(moved!.start, moved!.end), "希望帮忙核实", "区间跟着原文字到了新位置");
  assert.notEqual(moved!.start, target!.start, "字符位置发生平移，不再停在旧偏移");
  assert.ok(spansOf()!.every((s) => s!.status !== "dangling"), "调换不产生悬空");

  const cf1 = useStore.getState().reviewConflicts.find((c) => c.id === "conflict-text-001")!;
  assert.ok(cf1.candidates.some((c) => c.recomputed), "按新稿件重算候选");
  assert.ok(cf1.candidates.filter((c) => c.status === "invalidated").length >= 3, "旧候选失效留档");
  assert.equal(cf1.status, "待处理");

  // 2) 先确认重算结果，再拿掉依据所在整段 → 应退回待处理
  const activeCandidate = cf1.candidates.find((c) => c.status !== "invalidated")!;
  useStore.getState().resolveConflict("conflict-text-001", activeCandidate.id);
  assert.equal(
    useStore.getState().reviewConflicts.find((c) => c.id === "conflict-text-001")!.status,
    "已确认",
  );

  const removed = reordered
    .split("\n\n")
    .filter((p) => !p.includes("优惠券只能在新设备上使用"))
    .join("\n\n");
  const r2 = useStore.getState().applyTextRevision(taskId, removed);
  assert.equal(r2.ok, true);
  const cf2 = useStore.getState().reviewConflicts.find((c) => c.id === "conflict-text-001")!;
  assert.equal(cf2.status, "待处理", "已确认但依据不在 → 退回待处理");
  assert.ok(!useStore.getState().resolvedConflicts["conflict-text-001"]);
  assert.ok(cf2.candidates.every((c) => c.status === "invalidated"), "被拿掉文字上的候选直接失效");

  // 3) 同稿重试 → 幂等
  const duplicate = useStore.getState().applyTextRevision(taskId, removed);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicated, true);
});
