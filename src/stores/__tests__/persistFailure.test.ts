import { strict as assert } from "node:assert";
import { test } from "node:test";
import { setupBrowserEnv } from "./_env";

const { failNextWrite } = setupBrowserEnv();
const { useWorkbenchStore } = await import("../workbenchStore");

test("落盘失败→上一版保留；重试不重复追加", () => {
  const useStore = useWorkbenchStore;
  const taskId = "text-001";
  const before = useStore.getState().tasks.find((t) => t.id === taskId)!;
  const beforeVersion = (before.contentVersion as number | undefined) ?? 0;
  const beforeSpanCount = useStore.getState().annotations.filter((a) => a.taskId === taskId).length;
  const nextContent = `${before.content}\n\n补充一句。`;

  // 首次写入失败：内存一个字段都不能动
  failNextWrite(1);
  const failed = useStore.getState().applyTextRevision(taskId, nextContent);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "write-failed");
  assert.ok(failed.error);

  const still = useStore.getState().tasks.find((t) => t.id === taskId)!;
  assert.equal(still.content, before.content, "失败后仍是上一版内容");
  assert.equal((still.contentVersion as number | undefined) ?? 0, beforeVersion, "版本号不前移");
  assert.equal(
    useStore.getState().annotations.filter((a) => a.taskId === taskId).length,
    beforeSpanCount,
    "标注也停在上一版",
  );

  // 重试（故障已解除）：首次成功，只追加一条，duplicated 为假
  const retried = useStore.getState().applyTextRevision(taskId, nextContent);
  assert.equal(retried.ok, true);
  assert.equal(Boolean(retried.duplicated), false, "之前没落上，重试算首次成功");
  assert.equal(useStore.getState().tasks.find((t) => t.id === taskId)!.content, nextContent);

  // 再重试同稿：幂等，不重复追加、版本不重复递增
  const again = useStore.getState().applyTextRevision(taskId, nextContent);
  assert.equal(again.ok, true);
  assert.equal(again.duplicated, true);
  const after = useStore.getState().tasks.find((t) => t.id === taskId)!;
  assert.equal((after.contentVersion as number | undefined) ?? 0, beforeVersion + 1);
});
