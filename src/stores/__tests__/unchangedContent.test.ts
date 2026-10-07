import { strict as assert } from "node:assert";
import { test } from "node:test";
import { setupBrowserEnv } from "./_env";

setupBrowserEnv();
const { useWorkbenchStore } = await import("../workbenchStore");

test("与当前稿件相同且从未落档的内容不产生新版本", () => {
  const useStore = useWorkbenchStore;
  const taskId = "text-001";
  const content = useStore.getState().tasks.find((t) => t.id === taskId)!.content as string;
  const result = useStore.getState().applyTextRevision(taskId, content);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unchanged");
});
