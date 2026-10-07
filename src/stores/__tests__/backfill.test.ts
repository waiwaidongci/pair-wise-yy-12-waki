import { strict as assert } from "node:assert";
import { test } from "node:test";
import { setupBrowserEnv } from "./_env";

setupBrowserEnv();
const { backfillSpanAnchors } = await import("../workbenchStore");
import type { Annotation, AnnotationTask } from "../../types/annotation";

const content = "第一句Alpha。\n\n第二句Beta在中间。";
const textTask = {
  id: "t1",
  kind: "text",
  content,
} as AnnotationTask;

test("旧持久化文本区间缺锚文本时按当前稿件回填，已对不上的标悬空而不是硬锚", () => {
  const legacy: Annotation[] = [
    {
      id: "old-a",
      taskId: "t1",
      kind: "text-span",
      scope: "span",
      labelId: "negative",
      author: "何序",
      createdAt: "2026-10-01T00:00:00.000Z",
      start: content.indexOf("第二句Beta在中间。"),
      end: content.length,
    } as Annotation,
    {
      id: "old-out-of-range",
      taskId: "t1",
      kind: "text-span",
      scope: "span",
      labelId: "request",
      author: "周岚",
      createdAt: "2026-10-01T00:00:00.000Z",
      start: 500,
      end: 520,
    } as Annotation,
  ];

  const backfilled = backfillSpanAnchors(legacy, [textTask]);
  const a = backfilled.find((x) => x.id === "old-a")!;
  assert.equal(a.kind, "text-span");
  if (a.kind === "text-span") {
    assert.equal(a.anchorText, "第二句Beta在中间。");
    assert.equal(a.anchorStatus, "anchored");
  }
  const b = backfilled.find((x) => x.id === "old-out-of-range")!;
  assert.equal(b.kind, "text-span");
  if (b.kind === "text-span") {
    assert.equal(b.anchorStatus, "dangling", "越界区间不强行锚到错误句子");
  }
});
