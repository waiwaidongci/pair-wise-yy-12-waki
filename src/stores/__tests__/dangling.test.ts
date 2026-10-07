import { strict as assert } from "node:assert";
import { test } from "node:test";
import { setupBrowserEnv } from "./_env";

setupBrowserEnv();
const { useWorkbenchStore } = await import("../workbenchStore");

test("删除手机号所在段→敏感区间悬空留档，区间不丢失", () => {
  const useStore = useWorkbenchStore;
  const taskId = "text-001";
  const content = useStore.getState().tasks.find((t) => t.id === taskId)!.content as string;
  const removed = content
    .split("\n\n")
    .filter((p) => !p.includes("13800001234"))
    .join("\n\n");

  const result = useStore.getState().applyTextRevision(taskId, removed);
  assert.equal(result.ok, true);
  assert.ok(result.report?.dangled.includes("ann-text-001-b"));

  const phoneSpan = useStore.getState().annotations.find((a) => a.id === "ann-text-001-b")!;
  assert.ok(phoneSpan, "悬空区间没有被删除");
  assert.equal(phoneSpan.kind, "text-span");
  if (phoneSpan.kind === "text-span") {
    assert.equal(phoneSpan.anchorStatus, "dangling");
    assert.equal(phoneSpan.anchorText, "13800001234", "对应原文留档可查");
    assert.ok(phoneSpan.dangledByRevision, "记录悬空时的修订批次");
  }

  // 其它仍在新稿中的区间保持锚定
  const others = useStore
    .getState()
    .annotations.filter((a) => a.taskId === taskId && a.kind === "text-span" && a.scope === "span");
  const anchored = others.filter((a) => a.kind === "text-span" && a.anchorStatus !== "dangling");
  assert.ok(anchored.length >= 3);
  for (const a of anchored) {
    if (a.kind !== "text-span") continue;
    assert.equal(removed.slice(a.start, a.end), a.anchorText, "锚定区间覆盖的仍是原文字");
  }
});
